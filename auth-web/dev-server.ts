import { createServer } from 'node:http';
import handler from './api/index.ts';

const PORT = Number(process.env.PORT ?? 3100);

createServer(handler).listen(PORT, '0.0.0.0', () => {
  console.log(`Mock auth site: http://localhost:${PORT}/login`);
});
