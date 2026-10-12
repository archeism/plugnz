"""Auth-free body recorder forwarding real protocol streams to the dedicated live proxy."""
import http.client, http.server, json, os, threading, time
from pathlib import Path
from urllib.parse import urlsplit

class LiveRecorder:
    def __init__(self, directory, upstream, max_calls=6):
        self.directory=Path(directory);self.upstream=urlsplit(upstream);self.max_calls=max_calls
        self.calls=0;self.requests=[];self.failures=[];self.lock=threading.Lock()
        owner=self
        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_GET(self):self.forward()
            def do_POST(self):self.forward()
            def forward(self):
                size=int(self.headers.get('Content-Length','0'))
                if size>1024*1024:owner.failures.append('1MiB request body cap');self.send_error(413);return
                raw=self.rfile.read(size) if size else b''
                inference=self.path.split('?')[0].rstrip('/') in ['/v1/messages','/v1/chat/completions','/v1/responses']
                with owner.lock:
                    if inference:
                        if owner.calls>=owner.max_calls:owner.failures.append('Six inference calls exhausted');self.send_error(429);return
                        owner.calls+=1
                    index=len(owner.requests);row={'index':index,'inference':inference,'monotonic_ns':time.monotonic_ns(),'method':self.command,'path':self.path}
                    try:row['body']=json.loads(raw) if raw else None
                    except ValueError:row['body_unparsed_bytes']=len(raw)
                    owner.requests.append(row)
                    with (owner.directory/'requests.jsonl').open('a') as f:f.write(json.dumps(row)+'\n')
                connection=http.client.HTTPConnection(owner.upstream.hostname,owner.upstream.port or 80,timeout=175)
                # Only the disposable frontend token enters this process; no provider credentials or auth headers are logged.
                token=os.environ['LIVE_PROXY_TOKEN']
                headers={'Content-Type':self.headers.get('Content-Type','application/json'),'Authorization':'Bearer '+token,'Content-Length':str(len(raw))}
                for name in ['anthropic-version','anthropic-beta']:
                    if self.headers.get(name):headers[name]=self.headers[name]
                captured=0
                try:
                    path=owner.upstream.path.rstrip('/')+self.path
                    connection.request(self.command,path,body=raw if raw else None,headers=headers)
                    response=connection.getresponse();self.send_response(response.status)
                    self.send_header('Content-Type',response.getheader('Content-Type','application/json'));self.send_header('Connection','close');self.end_headers()
                    with (owner.directory/f'response-{index:02d}.body').open('wb') as f:
                        while True:
                            chunk=response.read1(65536)
                            if not chunk:break
                            captured+=len(chunk)
                            if captured>2*1024*1024:owner.failures.append('2MiB response body cap');break
                            f.write(chunk);self.wfile.write(chunk);self.wfile.flush()
                    (owner.directory/f'response-{index:02d}.json').write_text(json.dumps({'status':response.status,'body_bytes':captured,'content_type':response.getheader('Content-Type'),'completed_monotonic_ns':time.monotonic_ns()},indent=2)+'\n')
                except (BrokenPipeError,ConnectionResetError):owner.failures.append('Native client closed forwarded stream')
                except Exception as error:owner.failures.append(type(error).__name__+': '+str(error))
                finally:connection.close();self.close_connection=True
        self.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);self.server.daemon_threads=True
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
    def start(self):self.thread.start();return 'http://127.0.0.1:'+str(self.server.server_address[1])
    def close(self):self.server.shutdown();self.server.server_close();self.thread.join(timeout=2)
