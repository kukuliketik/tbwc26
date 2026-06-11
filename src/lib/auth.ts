import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from './prisma'

export const { handlers, auth, signIn, signOut } = NextAuth({
  debug: process.env.NODE_ENV === 'development',
  adapter: PrismaAdapter(prisma),
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
    session: async ({ session, user }) => {
      if (session.user) {
        session.user.id = user.id
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
