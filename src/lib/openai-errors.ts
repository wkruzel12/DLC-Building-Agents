import 'server-only';
import OpenAI from 'openai';

export class RunError extends Error {
 constructor(message:string,public status=502){super(message);this.name='RunError';}
}

// Never forward provider error bodies: they may contain credential or prompt details.
export function openaiFailure(error:unknown):RunError {
 if(error instanceof RunError)return error;
 if(error instanceof OpenAI.APIConnectionTimeoutError)return new RunError('OpenAI timed out. Please retry the run.',504);
 if(error instanceof OpenAI.APIConnectionError)return new RunError('Could not connect to OpenAI. Check the server network connection and retry.');
 if(error instanceof OpenAI.APIError){
  if(error.code==='insufficient_quota')return new RunError('OpenAI credits or project budget are exhausted. Check billing and project limits.',429);
  if(error.status===429)return new RunError('OpenAI rate limit reached. Wait briefly before running again.',429);
  if(error.status===401)return new RunError('OpenAI rejected the server API key. Check OPENAI_API_KEY in .env.local.',502);
  if(error.status===403)return new RunError('This OpenAI project does not have permission to use the configured model.',502);
  if(error.status===404||error.code==='model_not_found')return new RunError('The configured OpenAI model is unavailable. Check OPENAI_MODEL and project model access.',502);
  if(error.status===400)return new RunError('OpenAI rejected the model or request settings. Check OPENAI_MODEL supports Responses and structured outputs.',502);
  return new RunError('OpenAI could not complete the request. Please retry later.');
 }
 return new RunError('AI processing failed. Please retry the run.');
}
