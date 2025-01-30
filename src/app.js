import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

const app = express();

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
}));

app.use(express.json({limit: "16kb"}))  // limit json data send to server
app.use(express.urlencoded({extended: true, limit: "16kb"}))
app.use(express.static("public"))   //image pdf save to server in public folder

app.use(cookieParser())

export {app}

