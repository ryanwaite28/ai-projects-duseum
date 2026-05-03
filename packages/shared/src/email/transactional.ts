/// <reference path="./html.d.ts" />
import Handlebars from 'handlebars'
import { sendHtmlEmail } from './ses.js'

import welcomeHtml from './templates/welcome.html'
import platformSubStartedHtml from './templates/platform-sub-started.html'
import platformSubCanceledHtml from './templates/platform-sub-canceled.html'
import authorSubStartedViewerHtml from './templates/author-sub-started-viewer.html'
import authorSubCanceledViewerHtml from './templates/author-sub-canceled-viewer.html'
import authorSubStartedAuthorHtml from './templates/author-sub-started-author.html'
import authorSubCanceledAuthorHtml from './templates/author-sub-canceled-author.html'
import connectOnboardingCompleteHtml from './templates/connect-onboarding-complete.html'
import platformNewSubscriberHtml from './templates/platform-new-subscriber.html'
import platformFeatureBookedHtml from './templates/platform-feature-booked.html'

const tmpl = {
  welcome: Handlebars.compile(welcomeHtml),
  platformSubStarted: Handlebars.compile(platformSubStartedHtml),
  platformSubCanceled: Handlebars.compile(platformSubCanceledHtml),
  authorSubStartedViewer: Handlebars.compile(authorSubStartedViewerHtml),
  authorSubCanceledViewer: Handlebars.compile(authorSubCanceledViewerHtml),
  authorSubStartedAuthor: Handlebars.compile(authorSubStartedAuthorHtml),
  authorSubCanceledAuthor: Handlebars.compile(authorSubCanceledAuthorHtml),
  connectOnboardingComplete: Handlebars.compile(connectOnboardingCompleteHtml),
  platformNewSubscriber: Handlebars.compile(platformNewSubscriberHtml),
  platformFeatureBooked: Handlebars.compile(platformFeatureBookedHtml),
}

export const sendWelcomeEmail = (to: string, data: { displayName: string; browseUrl: string }) =>
  sendHtmlEmail(to, 'Welcome to Duseum', tmpl.welcome(data))

export const sendPlatformSubStartedEmail = (
  to: string,
  data: { displayName: string; currentPeriodEnd: string; browseUrl: string; manageUrl: string }
) => sendHtmlEmail(to, 'Your Duseum subscription is active', tmpl.platformSubStarted(data))

export const sendPlatformSubCanceledEmail = (
  to: string,
  data: { displayName: string; manageUrl: string }
) => sendHtmlEmail(to, 'Your Duseum subscription has been canceled', tmpl.platformSubCanceled(data))

export const sendAuthorSubStartedViewerEmail = (
  to: string,
  data: {
    viewerDisplayName: string
    authorDisplayName: string
    authorUrl: string
    currentPeriodEnd: string
    manageUrl: string
  }
) =>
  sendHtmlEmail(
    to,
    `You're now subscribed to ${data.authorDisplayName}`,
    tmpl.authorSubStartedViewer(data)
  )

export const sendAuthorSubCanceledViewerEmail = (
  to: string,
  data: {
    viewerDisplayName: string
    authorDisplayName: string
    authorUrl: string
    manageUrl: string
  }
) =>
  sendHtmlEmail(
    to,
    `Your subscription to ${data.authorDisplayName} has ended`,
    tmpl.authorSubCanceledViewer(data)
  )

export const sendAuthorSubStartedAuthorEmail = (
  to: string,
  data: { authorDisplayName: string; dashboardUrl: string }
) => sendHtmlEmail(to, 'You have a new subscriber', tmpl.authorSubStartedAuthor(data))

export const sendAuthorSubCanceledAuthorEmail = (
  to: string,
  data: { authorDisplayName: string; dashboardUrl: string }
) => sendHtmlEmail(to, 'A subscriber has left your gallery', tmpl.authorSubCanceledAuthor(data))

export const sendConnectOnboardingCompleteEmail = (
  to: string,
  data: { authorDisplayName: string; dashboardUrl: string }
) => sendHtmlEmail(to, 'Your Stripe account is ready', tmpl.connectOnboardingComplete(data))

export const sendPlatformNewSubscriberEmail = (
  to: string,
  data: { userId: string; currentPeriodEnd?: string }
) => sendHtmlEmail(to, '[Internal] New platform subscriber', tmpl.platformNewSubscriber(data))

export const sendPlatformFeatureBookedEmail = (
  to: string,
  data: { authorId: string; authorDisplayName: string; isoWeek: string; feeUsd: number }
) => sendHtmlEmail(to, '[Internal] Weekly feature booked', tmpl.platformFeatureBooked(data))
