"""Probe a public-installed persona package in an isolated Dcode HOME only."""
import asyncio,json,os,sys
from pathlib import Path
from deepagents_code.extensions.runtime import load_extensions
from deepagents_code.skills.load import list_skills,load_skill_content
from deepagents_code.plugins.adapters.skills_middleware import PluginSkillsMiddleware
from deepagents.backends import FilesystemBackend
from langchain.agents import create_agent
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage,HumanMessage
from langchain_core.callbacks import BaseCallbackHandler

home=Path(sys.argv[1]).resolve()
native_id=sys.argv[2]
source=Path(sys.argv[3]).resolve()
registry=json.loads((home/'.deepagents'/'.state'/'installed_plugins.json').read_text())
root=Path(registry['plugins'][native_id][0]['installPath'])
class Capture(BaseCallbackHandler):
    prompts=[]
    def on_chat_model_start(self,serialized,messages,**kwargs):
        self.prompts.append(str(messages))
async def main():
    cache=root/'__pycache__'
    assert not sys.dont_write_bytecode and 'PYTHONDONTWRITEBYTECODE' not in os.environ
    assert cache.stat().st_mode & 0o777 == 0o555 and not list(cache.iterdir()) and not os.access(cache,os.W_OK)
    extensions=await load_extensions(cwd=home)
    assert extensions.active and not extensions.errors,extensions.errors
    catalog=list_skills(plugin_skill_sources=[(root/'skills',native_id)])
    personas=[item for item in catalog if ':persona-' in item['name']]
    assert len(personas)==len(list((source/'agents').glob('*.md')))>0
    for original in (source/'agents').glob('*.md'):
        assert (root/'agents'/original.name).read_bytes()==original.read_bytes()
    for persona in personas:
        content=load_skill_content(persona['path'],allowed_roots=[root.resolve()])
        assert content and 'disable-model-invocation: true' in content
        original=source/'agents'/(persona['name'].split(':persona-')[-1]+'.md')
        body=original.read_text().split('---',2)[2]
        assert body in content
    backend=FilesystemBackend(root_dir=str(root),virtual_mode=False)
    middleware=PluginSkillsMiddleware(backend=backend,sources=[(str(root/'skills'),'plugin',native_id)])
    capture=Capture()
    agent=create_agent(model=GenericFakeChatModel(messages=iter([AIMessage(content='ok')])),middleware=[middleware,*[item.unit for item in extensions.registry.middleware]])
    await agent.ainvoke({'messages':[HumanMessage(content='hello')]},config={'callbacks':[capture]})
    prompt='\n'.join(capture.prompts)
    assert all(item['name'] not in prompt for item in personas),prompt
    ordinary=[item for item in catalog if ':persona-' not in item['name'] and 'disable-model-invocation: true' not in Path(item['path']).read_text() and 'disable_model_invocation: true' not in Path(item['path']).read_text()]
    assert ordinary and any(item['name'] in prompt for item in ordinary),prompt
    assert not list(cache.iterdir()),list(cache.iterdir())
    print(json.dumps({'bytecodeSuppression':sys.dont_write_bytecode,'nativeCacheWritable':os.access(cache,os.W_OK),'nativeCacheMode':cache.stat().st_mode & 0o777,'nativeCacheEntries':[item.name for item in cache.iterdir()],'nativeVersion':'0.1.83','nativeId':native_id,'extensionErrors':extensions.errors,'frontendSkillCount':len(catalog),'personaFrontendNames':[item['name'] for item in personas],'personaExplicitBodyLoaded':True,'originalAgentBytesPreserved':True,'personaModelVisible':False,'ordinaryModelVisible':True,'modelCalls':len(capture.prompts)}))
asyncio.run(main())
