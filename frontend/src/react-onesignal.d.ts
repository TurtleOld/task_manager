declare module 'react-onesignal' {
  export interface OneSignalInitOptions {
    appId: string
    allowLocalhostAsSecureOrigin?: boolean
    serviceWorkerParam?: {
      scope?: string
    }
    path?: string
  }

  export interface OneSignalUserPushSubscription {
    id?: string | null
    token?: string | null
    optedIn?: boolean
    addEventListener?(event: 'change', listener: () => void): void
    removeEventListener?(event: 'change', listener: () => void): void
  }

  export interface OneSignalUser {
    pushSubscription?: OneSignalUserPushSubscription
    PushSubscription?: OneSignalUserPushSubscription
  }

  export interface OneSignalSlidedown {
    promptPush(): void | Promise<void>
  }

  export interface OneSignalApi {
    init(options: OneSignalInitOptions): Promise<void>
    login(externalId: string): Promise<void>
    logout(): Promise<void>
    User: OneSignalUser
    Slidedown: OneSignalSlidedown
  }

  const OneSignal: OneSignalApi
  export default OneSignal
}
