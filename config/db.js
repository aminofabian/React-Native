import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

export const sql = neon(process.env.DATABASE_URL);