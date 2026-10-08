import "dotenv/config";

function getEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  appId: getEnv("APP_ID", "emotionverse"),
  appSecret: getEnv("APP_SECRET", "emotionverse-secret"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: getEnv("DATABASE_URL", ""),
};
