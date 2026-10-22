import {instructionFields} from '@/lib/combined-builder';
import type {Attempt} from '@/lib/types';

export function InstructionCards({steps}:{steps:Attempt['steps']}){
 return <div className="instruction-cards" aria-label="Your combined instructions">{instructionFields.map((field,index)=><section className="instruction-card" key={field.id}><h4><span aria-hidden="true">{String(index+1).padStart(2,'0')}</span>{field.label}</h4><p>{steps[field.id]||'No instructions recorded.'}</p></section>)}</div>;
}
