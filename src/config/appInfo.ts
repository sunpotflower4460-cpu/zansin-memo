import appConfig from '../../app.json';

// App Store Connect に登録するURLと同じものをここで管理する。
// 公開URLを独自ドメインなどに移す場合は、この2行と docs/app-store-submission.md を更新する。
export const PRIVACY_POLICY_URL = 'https://github.com/sunpotflower4460-cpu/zansin-memo/blob/main/docs/privacy-policy.md';
export const SUPPORT_URL = 'https://github.com/sunpotflower4460-cpu/zansin-memo/issues';

export const APP_VERSION: string = appConfig.expo.version;
