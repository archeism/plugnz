import asyncio,json,sys
from pathlib import Path
from deepagents_code.extensions.runtime import load_extensions
from deepagents_code.skills.load import list_skills,load_skill_content
from deepagents_code.plugins.adapters.skills_middleware import PluginSkillsMiddleware
from deepagents.backends import FilesystemBackend
from langchain.agents import create_agent
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage,HumanMessage
from langchain_core.callbacks import BaseCallbackHandler

root=Path(sys.argv[1]).resolve()
state=root/'.deepagents'/'.state'
state.mkdir(parents=True,exist_ok=True)
(state/'installed_plugins.json').write_text(json.dumps({'version':2,'plugins':{'probe@local':[{'installPath':str(root)}]}}))
(state/'plugin_state.json').write_text(json.dumps({'version':1,'enabledPlugins':{'probe@local':True}}))
class Capture(BaseCallbackHandler):
    prompts=[]
    def on_chat_model_start(self,serialized,messages,**kwargs):
        self.prompts.append(str(messages))
async def main():
    extensions=await load_extensions(cwd=root)
    assert extensions.active and not extensions.errors,extensions.errors
    catalog=list_skills(plugin_skill_sources=[(root/'skills','probe@local')])
    assert len(catalog)==2,catalog
    manual=next(item for item in catalog if 'manual' in item['name'])
    assert 'MANUAL_CONTENT_TOKEN' in load_skill_content(manual['path'],allowed_roots=[root.resolve()])
    backend=FilesystemBackend(root_dir=str(root),virtual_mode=False)
    middleware=PluginSkillsMiddleware(backend=backend,sources=[(str(root/'skills'),'plugin','probe@local')])
    capture=Capture()
    agent=create_agent(model=GenericFakeChatModel(messages=iter([AIMessage(content='ok')])),middleware=[middleware,*[item.unit for item in extensions.registry.middleware]])
    result=await agent.ainvoke({'messages':[HumanMessage(content='hello')]},config={'callbacks':[capture]})
    prompt='\n'.join(capture.prompts)
    assert 'ORDINARY_DESCRIPTION_VISIBLE' in prompt,prompt
    assert 'MANUAL_DESCRIPTION_SECRET' not in prompt,prompt
    print(json.dumps({'nativeVersion':'0.1.83','extensionErrors':extensions.errors,'frontendSkills':[s['name'] for s in catalog],'manualExplicitContentLoaded':True,'ordinaryModelVisible':True,'manualModelVisible':False,'modelCalls':len(capture.prompts)}))
asyncio.run(main())
