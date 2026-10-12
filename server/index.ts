import 'dotenv/config';
import { createApp } from './app.js';
const port = Number(process.env.PORT || 3001);
const provider = process.env.AI_PROVIDER || 'mock';
createApp(provider).listen(port,'0.0.0.0',()=>console.log(`EnglishMind server: http://localhost:${port} · provider=${provider}`));
