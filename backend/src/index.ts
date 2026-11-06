import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import {initDatabase,databaseStatus,markDatabaseUnavailable} from './shared/db/store.js';
import {readingRouter} from './features/reading/routes.js';
import {getArticle} from './features/reading/service.js';
import {initNewsRepository} from './features/reading/repository.js';
import {initializeNewsJobs,startNewsScheduler} from './features/reading/jobs.js';
import {authRouter,requireAuth,initAuth} from './features/auth/routes.js';
import {dictionaryRouter} from './features/dictionary/routes.js';
import {vocabularyRouter} from './features/vocabulary/routes.js';
import {initializeVocabulary} from './features/vocabulary/repository.js';
import createAiRouter from './features/translation/routes.js';
import {TranslationService} from './features/translation/service.js';
import {TranslationJobs} from './features/translation/jobs.js';
import {initializeTranslationJobTable} from './features/translation/job-repository.js';

const app=express();
const origin=(process.env.FRONTEND_URL||'http://localhost:3000').replace(/\/$/,'');
app.disable('x-powered-by');
app.set('trust proxy',Number(process.env.TRUST_PROXY??(process.env.NODE_ENV==='production'?'1':'0')));
app.use(helmet());app.use(cors({origin,credentials:true}));app.use(cookieParser());
app.use((req,res,next)=>{if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin&&req.headers.origin!==origin){res.status(403).json({error:'Origin not allowed'});return;}next();});
app.use(express.json({limit:'15mb'}));
app.use('/api',rateLimit({windowMs:60000,limit:180,standardHeaders:true,legacyHeaders:false}));
app.get('/api/health',(_req,res)=>res.status(databaseStatus==='connected'?200:503).json({ok:databaseStatus==='connected',database:databaseStatus,persistence:'mysql',newsAvailable:databaseStatus==='connected',googleConfigured:Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET)}));
const translations=new TranslationService();
const translationJobs=new TranslationJobs(getArticle,translations);
app.use('/api',readingRouter);
app.use('/api/auth',authRouter);
app.use('/api/dictionary',dictionaryRouter);
app.use('/api/words',vocabularyRouter);
app.use('/api/ai',createAiRouter({getArticle,requireAuth,translations,translationJobs}));
app.use((_req,res)=>res.status(404).json({error:'Route not found'}));
app.use((err:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{if(err.status!==503)console.error(err.message);res.status(err.status||500).json({error:err.status===400?'Invalid request body':err.status===503?err.message:'Request could not be completed',...(err.code?{code:err.code}:{})});});

// Render can start the API before its private MySQL service has finished bootstrapping.
const startupWait=Math.min(120000,Math.max(0,Number(process.env.DB_STARTUP_WAIT_MS??(process.env.NODE_ENV==='production'?60000:0))||0));
const deadline=Date.now()+startupWait;
while(true){
 await initDatabase();
 try{await initNewsRepository();await initializeNewsJobs();await initializeTranslationJobTable();break;}catch{markDatabaseUnavailable();}
 if(Date.now()>=deadline)break;
 await new Promise(resolve=>setTimeout(resolve,Math.min(3000,deadline-Date.now())));
}
await initAuth();await initializeVocabulary();
const port=Number(process.env.PORT||4000);
app.listen(port,'0.0.0.0',()=>{console.log(`LingoPress API on http://localhost:${port}; database=${databaseStatus}`);startNewsScheduler();translationJobs.startWorker();});
