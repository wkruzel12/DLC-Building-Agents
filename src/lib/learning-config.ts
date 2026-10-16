import 'server-only';
import {DEFAULT_LEARNING_TARGET} from './results-learning';
export function learningTarget(){const raw=process.env.LEARNING_TARGET_ACCURACY;if(!raw?.trim())return DEFAULT_LEARNING_TARGET;const value=Number(raw);return Number.isFinite(value)&&value>=1&&value<=100?value:DEFAULT_LEARNING_TARGET;}
