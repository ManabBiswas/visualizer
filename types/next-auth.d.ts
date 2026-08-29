import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      login: string;
      avatarUrl?: string;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    githubId?: string;
    login?: string;
    avatarUrl?: string;
  }
}
