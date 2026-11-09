import serverless from 'serverless-http';
import app from '../../server/index.js';

const serverlessHandler = serverless(app);

export const handler = async (event, context) => {
  try {
    return await serverlessHandler(event, context);
  } catch (error) {
    console.error('[Netlify Function Error]:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Error en la función del servidor.' })
    };
  }
};
