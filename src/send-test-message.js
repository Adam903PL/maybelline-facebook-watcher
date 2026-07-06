import { sendMessage } from './telegram.js';

const text = process.argv[2] ?? '✅ Test message from maybelline-fb-watcher';
await sendMessage(text);
console.log('Test message sent.');
