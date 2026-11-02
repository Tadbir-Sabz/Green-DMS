import { Pool } from "pg";
const pool = new Pool();
export const pg = { query: (sql: string, params?: any[]) => pool.query(sql, params) };
export default pg;
