import 'next-auth'

declare module 'next-auth' {
  interface Session {
    idToken?: string
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}
