import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from './prisma'

export const { handlers, auth, signIn, signOut } = NextAuth({
  debug: process.env.NODE_ENV === 'development',
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  pages: {
    signIn: '/',
    error: '/',
  },
  events: {
    async signOut(message) {
      const session = 'session' in message ? message.session : undefined
      if (session?.userId) {
        await prisma.session.deleteMany({ where: { userId: session.userId } })
      }
    },
  },
  callbacks: {
    signIn: async ({ account, profile }) => {
      if (account?.provider === 'google' && profile?.email) {
        return true
      }
      return true
    },
    jwt: async ({ token, account }) => {
      if (account?.id_token) {
        token.idToken = account.id_token
      }
      return token
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.sub ?? ''
      }
      if (token?.idToken) {
        (session as unknown as Record<string, unknown>).idToken = token.idToken
      }
      return session
    },
  },
  logger: {
    error(code, ...message) {
      console.error('[auth error]', code, message)
    },
    warn(code, ...message) {
      console.warn('[auth warn]', code, message)
    },
    debug(code, ...message) {
      console.log('[auth debug]', code, message)
    },
  },
})
