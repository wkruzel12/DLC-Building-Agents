import {z} from 'zod';

export const runInput=z.object({case_id:z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),steps:z.object({extract:z.string().trim().min(10).max(1500),check:z.string().trim().min(10).max(1500),flag:z.string().trim().min(10).max(1500)})});
