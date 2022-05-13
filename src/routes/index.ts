import express from 'express';
import { getContent } from '../controllers/url';
const router = express.Router();

router.get('/api/v1/', getContent);

export default router;
