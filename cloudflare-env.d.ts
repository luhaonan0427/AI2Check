declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    AI_PROVIDER?: 'openai' | 'deepseek';
    DEEPSEEK_API_KEY?: string;
    DEEPSEEK_MODEL?: string;
    TEACHER_EMAILS?: string;
    LOCAL_DEMO?: string;
    ADMIN_EMAIL?: string;
  }
}
