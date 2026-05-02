import { Amplify } from 'aws-amplify'

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId:       import.meta.env.VITE_COGNITO_USER_POOL_ID as string,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID as string,
      loginWith: {
        oauth: {
          domain:          import.meta.env.VITE_COGNITO_DOMAIN as string,
          scopes:          ['email', 'openid', 'profile'],
          redirectSignIn:  [`${import.meta.env.VITE_APP_URL as string}/dashboard`],
          redirectSignOut: [import.meta.env.VITE_APP_URL as string],
          responseType:    'code' as const,
        },
      },
    },
  },
})
