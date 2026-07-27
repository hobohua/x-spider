import dayjs from 'dayjs';
import * as R from 'ramda';
import { Response } from '../interfaces/Response';
import { TwitterAccountInfo } from '../interfaces/TwitterAccountInfo';
import {
  TwitterMedia,
  TwitterMediaBase,
  TwitterMediaGif,
  TwitterMediaPhoto,
  TwitterMediaVideo,
} from '../interfaces/TwitterMedia';
import { TwitterPost } from '../interfaces/TwitterPost';
import { TwitterUser } from '../interfaces/TwitterUser';
import { request } from '../ipc/network';
import { useAppStateStore } from '../stores/app-state';
import { parseCookie } from '../utils/cookie';
import MediaType from '../enums/MediaType';

const HOST = 'x.com';

function getCommonHeaders(withCredentials = true): Record<string, string> {
  const cookies = useAppStateStore.getState().cookieString;
  return {
    'User-Agent': navigator.userAgent,
    Referer: `https://${HOST}`,
    ...(withCredentials
      ? {
          Authorization:
            'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
          Cookie: cookies,
          'X-Csrf-Token': parseCookie(cookies)['ct0'],
        }
      : {}),
  };
}

function ensureResponse(response: Response) {
  if (response.status >= 400) {
    log.error(response);
    throw new Error(`Response error: status=${response.status}`);
  }
}

export async function getAccountInfo(
  cookieStringOverride?: string,
): Promise<TwitterAccountInfo> {
  const res = await request({
    method: 'GET',
    url: `https://${HOST}`,
    responseType: 'text',
    headers: R.mergeRight(getCommonHeaders(false), {
      Cookie: cookieStringOverride,
    }),
  });
  ensureResponse(res);
  const html = res.body as string;
  const nameMatch = html.match(/"screen_name":"(.*?)"/);
  if (nameMatch === null) throw new Error('Cannot find name in response');

  const avatarMatch = html.match(/"profile_image_url_https":"(.*?)"/);
  if (avatarMatch === null) throw new Error('Cannot find avatar in response');

  return {
    screenName: nameMatch[1],
    avatar: avatarMatch[1],
  };
}

export async function getUser(screenName: string): Promise<TwitterUser> {
  const resp = await request({
    method: 'GET',
    responseType: 'json',
    url: `https://${HOST}/i/api/graphql/NimuplG1OB7Fd2btCLdBOw/UserByScreenName`,
    query: {
      features: JSON.stringify({
        hidden_profile_likes_enabled: true,
        hidden_profile_subscriptions_enabled: true,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
        subscriptions_verification_info_is_identity_verified_enabled: true,
        subscriptions_verification_info_verified_since_enabled: true,
        highlights_tweets_tab_ui_enabled: true,
        responsive_web_twitter_article_notes_tab_enabled: false,
        creator_subscriptions_tweet_preview_api_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled:
          false,
        responsive_web_graphql_timeline_navigation_enabled: true,
      }),
      fieldToggles: JSON.stringify({ withAuxiliaryUserLabels: false }),
      variables: JSON.stringify({
        screen_name: screenName,
        withSafetyModeUserFields: true,
      }),
    },
    headers: getCommonHeaders(),
  });
  ensureResponse(resp);

  const data = R.path(['data', 'user', 'result', 'legacy'])(resp.body) as any;

  if (!data) {
    throw new Error('找不到该用户');
  }

  return {
    avatar: data?.profile_image_url_https,
    name: data?.name,
    screenName: data?.screen_name,
    id: R.path<string>(['data', 'user', 'result', 'rest_id'])(
      resp.body,
    ) as string,
    mediaCount: data?.media_count,
    registerTime: dayjs(data.created_at),
  };
}

const mapTwitterPosts = (posts: any[]) => {
  const mapTwitterMedias = (medias: any[]) => {
    const toTwitterMediaBase: (v: any) => TwitterMediaBase = (v: any) => {
      return {
        id: v?.id_str,
        url: v?.media_url_https,
        width: v?.original_info?.width,
        height: v?.original_info?.height,
      };
    };

    const toPhoto: (v: any) => TwitterMediaPhoto = (v: any) => ({
      ...toTwitterMediaBase(v),
      type: MediaType.Photo,
    });

    const toVideo: (v: any) => TwitterMediaVideo = (v: any) => ({
      ...toTwitterMediaBase(v),
      type: MediaType.Video,
      videoInfo: {
        duration: v?.video_info?.duration_millis,
        variants: v?.video_info?.variants?.map?.((item: any) => ({
          bitrate: item?.bitrate,
          contentType: item?.contentType,
          url: item?.url,
        })),
        aspectRatio: v?.aspect_ratio,
      },
    });

    const toGif: (v: any) => TwitterMediaGif = (v: any) => ({
      ...toTwitterMediaBase(v),
      type: MediaType.Gif,
      videoInfo: {
        url: v?.video_info?.variants?.[0]?.url,
        aspectRatio: v?.video_info?.aspect_ratio,
      },
    });

    return R.pipe<any[], (TwitterMedia | null)[], TwitterMedia[]>(
      R.map<any, TwitterMedia | null>(
        R.cond<any, TwitterMedia | null>([
          [R.propEq('photo', 'type'), toPhoto],
          [R.propEq('video', 'type'), toVideo],
          [R.propEq('animated_gif', 'type'), toGif],
          [R.T, R.always(null)],
        ]),
      ),
      R.filter<TwitterMedia | null, TwitterMedia>(R.isNotNil),
    )(medias);
  };
  return R.map<any, TwitterPost>((item) => {
    return {
      id: item?.rest_id,
      views: R.isNotNil(item?.views?.count)
        ? Number(item.views.count)
        : undefined,
      createdAt: item.legacy?.created_at
        ? dayjs(item.legacy?.created_at)
        : undefined,
      bookmarkCount: item?.legacy?.bookmark_count,
      bookmarked: item?.legacy?.bookmarked,
      favoriteCount: item?.legacy?.favorite_count,
      favorited: item?.legacy?.favorited,
      fullText: item?.legacy?.full_text,
      lang: item?.legacy?.lang,
      possiblySensitive: item?.legacy?.possibly_sensitive,
      replyCount: item?.legacy?.reply_count,
      retweeted: item?.legacy?.retweeted,
      retweetCount: item?.legacy?.retweet_count,
      medias: item?.legacy?.entities?.media
        ? mapTwitterMedias(item.legacy?.entities?.media)
        : undefined,
      tags: R.pipe<any, any[], string[]>(
        R.path<any>(['legacy', 'entities', 'hashtags']),
        R.ifElse(R.isNotNil, R.map(R.prop('text')), R.always([])),
      )(item),
      user: {
        id: item?.core?.user_results?.result?.rest_id,
        avatar:
          item?.core?.user_results?.result?.legacy?.profile_image_url_https,
        mediaCount: item?.core?.user_results?.result?.legacy?.media_count,
        name: item?.core?.user_results?.result?.legacy?.name,
        screenName: item?.core?.user_results?.result?.legacy?.screen_name,
        registerTime: item?.core?.user_results?.result?.legacy?.created_at,
      },
    };
  })(posts);
};

const pathToInstructions = R.path<any>([
  'data',
  'user',
  'result',
  'timeline_v2',
  'timeline',
  'instructions',
]);

export async function getUserMedias(
  userId: string,
  cursor?: string,
  count = 20,
): Promise<{
  twitterPosts: TwitterPost[];
  cursor: string | null;
}> {
  const resp = await request({
    method: 'GET',
    url: `https://${HOST}/i/api/graphql/cEjpJXA15Ok78yO4TUQPeQ/UserMedia`,
    responseType: 'json',
    query: {
      features: JSON.stringify({
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
        creator_subscriptions_tweet_preview_api_enabled: true,
        responsive_web_graphql_timeline_navigation_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled:
          false,
        c9s_tweet_anatomy_moderator_badge_enabled: true,
        tweetypie_unmention_optimization_enabled: true,
        responsive_web_edit_tweet_api_enabled: true,
        graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
        view_counts_everywhere_api_enabled: true,
        longform_notetweets_consumption_enabled: true,
        responsive_web_twitter_article_tweet_consumption_enabled: true,
        tweet_awards_web_tipping_enabled: false,
        freedom_of_speech_not_reach_fetch_enabled: true,
        standardized_nudges_misinfo: true,
        tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled:
          true,
        rweb_video_timestamps_enabled: true,
        longform_notetweets_rich_text_read_enabled: true,
        longform_notetweets_inline_media_enabled: true,
        responsive_web_media_download_video_enabled: false,
        responsive_web_enhance_cards_enabled: false,
      }),
      variables: JSON.stringify({
        userId,
        count,
        cursor,
        includePromotedContent: false,
        withClientEventToken: false,
        withBirdwatchNotes: false,
        withVoice: true,
        withV2Timeline: true,
      }),
    },
    headers: getCommonHeaders(),
  });
  ensureResponse(resp);

  const extractTwitterPosts = (
    pathToInstructions: (data: any) => any,
    data: any,
  ): TwitterPost[] | undefined => {
    const pathToTwitterPostItems = (instructions: any): any => {
      const pathToModuleItemsFirst = R.pipe(
        R.find(R.pathEq('TimelineAddEntries', ['type'])),
        R.defaultTo({}),
        R.prop('entries'),
        R.defaultTo([]),
        R.find(R.pathEq('TimelineTimelineModule', ['content', 'entryType'])),
        R.defaultTo({}),
        R.path<any>(['content', 'items']),
      );

      const pathToModuleItemsMore = R.pipe(
        R.find(R.pathEq('TimelineAddToModule', ['type'])),
        R.defaultTo({}),
        R.prop('moduleItems'),
      );

      return R.pipe(
        R.either(pathToModuleItemsFirst, pathToModuleItemsMore),
        R.defaultTo([]),
        R.map(
          R.pipe(
            R.path(['item', 'itemContent', 'tweet_results', 'result']),
            R.ifElse<any, any, any>(
              R.propEq('TweetWithVisibilityResults', '__typename'),
              R.prop('tweet'),
              R.identity,
            ),
          ),
        ),
      )(instructions);
    };
    return R.pipe(
      pathToInstructions,
      R.ifElse(
        R.isNil,
        R.always([]),
        R.pipe(pathToTwitterPostItems, R.filter(R.isNotNil), mapTwitterPosts),
      ),
    )(data);
  };

  const extractNextCursor = (
    pathToInstructions: (data: any) => any,
    data: any,
  ): string | null => {
    return R.pipe<any, any, any, any, any, string | undefined, string | null>(
      pathToInstructions,
      R.find(R.pathEq('TimelineAddEntries', ['type'])),
      R.prop('entries'),
      R.find(R.pathEq('Bottom', ['content', 'cursorType'])),
      R.path(['content', 'value']),
      R.defaultTo(null),
    )(data);
  };

  const twitterPosts = extractTwitterPosts(pathToInstructions, resp.body);

  if (!twitterPosts || twitterPosts.length === 0) {
    return {
      cursor: null,
      twitterPosts: [],
    };
  }

  log.info('twitterPosts', twitterPosts);

  const nextCursor = extractNextCursor(pathToInstructions, resp.body);

  return {
    twitterPosts,
    cursor: nextCursor,
  };
}

export async function getUserTweets(
  userId: string,
  cursor?: string,
  count = 20,
): Promise<{
  twitterPosts: TwitterPost[];
  cursor: string | null;
}> {
  const resp = await request({
    method: 'GET',
    url: `https://${HOST}/i/api/graphql/9zyyd1hebl7oNWIPdA8HRw/UserTweets`,
    responseType: 'json',
    query: {
      features: JSON.stringify({
        rweb_tipjar_consumption_enabled: true,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
        creator_subscriptions_tweet_preview_api_enabled: true,
        responsive_web_graphql_timeline_navigation_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled:
          false,
        communities_web_enable_tweet_community_results_fetch: true,
        c9s_tweet_anatomy_moderator_badge_enabled: true,
        articles_preview_enabled: false,
        tweetypie_unmention_optimization_enabled: true,
        responsive_web_edit_tweet_api_enabled: true,
        graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
        view_counts_everywhere_api_enabled: true,
        longform_notetweets_consumption_enabled: true,
        responsive_web_twitter_article_tweet_consumption_enabled: true,
        tweet_awards_web_tipping_enabled: false,
        creator_subscriptions_quote_tweet_preview_enabled: false,
        freedom_of_speech_not_reach_fetch_enabled: true,
        standardized_nudges_misinfo: true,
        tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled:
          true,
        tweet_with_visibility_results_prefer_gql_media_interstitial_enabled:
          false,
        rweb_video_timestamps_enabled: true,
        longform_notetweets_rich_text_read_enabled: true,
        longform_notetweets_inline_media_enabled: true,
        responsive_web_enhance_cards_enabled: false,
      }),
      variables: JSON.stringify({
        userId,
        count,
        cursor,
        includePromotedContent: true,
        withQuickPromoteEligibilityTweetFields: true,
        withVoice: true,
        withV2Timeline: true,
      }),
    },
    headers: getCommonHeaders(),
  });
  ensureResponse(resp);

  const extractTwitterPosts = (
    pathToInstructions: (data: any) => any,
    data: any,
  ): TwitterPost[] | undefined => {
    const pathToTwitterPostItems = (instructions: any): any => {
      // @ts-ignore
      return R.pipe(
        R.find(R.pathEq('TimelineAddEntries', ['type'])),
        R.defaultTo({}),
        R.prop('entries'),
        R.defaultTo([]),
        R.map(
          R.cond([
            [
              R.pathSatisfies(R.startsWith('tweet'), ['entryId']),
              R.path(['content', 'itemContent', 'tweet_results', 'result']),
            ],
            [
              R.pathSatisfies(R.startsWith('profile-conversation'), [
                'entryId',
              ]),
              R.pipe(
                R.path<any>(['content', 'items']),
                R.map(
                  R.path(['item', 'itemContent', 'tweet_results', 'result']),
                ),
              ),
            ],
            [R.T, R.always(undefined)],
          ]),
        ),
        R.flatten,
        R.filter(
          R.allPass<any>([
            R.isNotNil,
            // 过滤掉转推
            R.complement(R.hasPath(['legacy', 'retweeted_status_result'])),
            // 过滤掉无媒体
            R.hasPath(['legacy', 'entities', 'media']),
            R.pathSatisfies(R.pipe(R.length, R.lte(0)), [
              'legacy',
              'entities',
              'media',
            ]),
          ]),
        ),
      )(instructions);
    };
    return R.pipe(
      pathToInstructions,
      pathToTwitterPostItems,
      mapTwitterPosts,
    )(data);
  };

  const extractNextCursor = (
    pathToInstructions: (data: any) => any,
    data: any,
  ): string | null => {
    return R.pipe<any, any, any, any, any, string | undefined, string | null>(
      pathToInstructions,
      R.find(R.pathEq('TimelineAddEntries', ['type'])),
      R.prop('entries'),
      R.find(R.pathEq('Bottom', ['content', 'cursorType'])),
      R.path(['content', 'value']),
      R.defaultTo(null),
    )(data);
  };

  const twitterPosts = extractTwitterPosts(pathToInstructions, resp.body);
  const nextCursor = extractNextCursor(pathToInstructions, resp.body);
  if (!twitterPosts || twitterPosts.length === 0) {
    return {
      cursor: nextCursor,
      twitterPosts: [],
    };
  }

  log.info('twitterPosts', twitterPosts);

  return {
    twitterPosts,
    cursor: nextCursor,
  };
}

/**
 * Likes 公共 features 参数（取自 X-Archive 参考项目已验证值）
 */
const LIKES_FEATURES = {
  rweb_video_screen_enabled: false,
  rweb_cashtags_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: true,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  rweb_cashtags_composer_attachment_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  rweb_conversational_replies_downvote_enabled: false,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

/**
 * 获取指定用户的点赞推文
 * 备注：传入自己的 userId 返回自己的点赞；传入他人 userId 尝试获取其公开点赞
 */
export async function getUserLikes(
  userId: string,
  cursor?: string,
  count = 20,
): Promise<{
  twitterPosts: TwitterPost[];
  cursor: string | null;
}> {
  const resp = await request({
    method: 'GET',
    url: `https://${HOST}/i/api/graphql/RozQdCp4CilQzrcuU0NY5w/Likes`,
    responseType: 'json',
    query: {
      features: JSON.stringify(LIKES_FEATURES),
      variables: JSON.stringify({
        userId,
        count,
        cursor,
        includePromotedContent: false,
      }),
    },
    headers: getCommonHeaders(),
  });
  ensureResponse(resp);

  // Likes 响应路径：data.user.result.timeline_v2.timeline.instructions
  // 兼容回退：data.user.result.timeline.timeline.instructions
  const pathToInstructions: (data: any) => any = R.pipe(
    R.path(['data', 'user', 'result', 'timeline_v2', 'timeline', 'instructions']),
    R.ifElse(
      R.isNil,
      R.path(['data', 'user', 'result', 'timeline', 'timeline', 'instructions']),
      R.identity,
    ),
  );

  const twitterPosts = extractPostsFromInstructions(pathToInstructions, resp.body);
  const nextCursor = extractCursorFromInstructions(pathToInstructions, resp.body);

  if (!twitterPosts || twitterPosts.length === 0) {
    return { cursor: null, twitterPosts: [] };
  }

  log.info('getUserLikes posts', twitterPosts);
  return { twitterPosts, cursor: nextCursor };
}

/**
 * 获取当前登录用户的收藏推文（无需 userId）
 */
export async function getUserBookmarks(
  cursor?: string,
  count = 20,
): Promise<{
  twitterPosts: TwitterPost[];
  cursor: string | null;
}> {
  const resp = await request({
    method: 'GET',
    url: `https://${HOST}/i/api/graphql/XD0ViOeSOW4YoeNTGjVaYw/Bookmarks`,
    responseType: 'json',
    query: {
      features: JSON.stringify(LIKES_FEATURES),
      variables: JSON.stringify({
        count,
        cursor,
        includePromotedContent: false,
      }),
    },
    headers: getCommonHeaders(),
  });
  ensureResponse(resp);

  // Bookmarks 响应路径：data.bookmark_timeline_v2.timeline.instructions
  // 兼容回退：data.bookmark_timeline.timeline.instructions
  const pathToInstructions: (data: any) => any = R.pipe(
    R.path(['data', 'bookmark_timeline_v2', 'timeline', 'instructions']),
    R.ifElse(
      R.isNil,
      R.path(['data', 'bookmark_timeline', 'timeline', 'instructions']),
      R.identity,
    ),
  );

  const twitterPosts = extractPostsFromInstructions(pathToInstructions, resp.body);
  const nextCursor = extractCursorFromInstructions(pathToInstructions, resp.body);

  if (!twitterPosts || twitterPosts.length === 0) {
    return { cursor: null, twitterPosts: [] };
  }

  log.info('getUserBookmarks posts', twitterPosts);
  return { twitterPosts, cursor: nextCursor };
}

/**
 * 从 Timeline instructions 中提取推文列表（通用逻辑）
 * 兼容三种模式：
 * 1. TimelineTimelineModule（分组模块，如 UserMedia）
 * 2. TimelineAddToModule（追加模块）
 * 3. 独立 tweet 条目（entryId 以 tweet- 开头，如 Likes/Bookmarks）
 */
function extractPostsFromInstructions(
  pathToInstructions: (data: any) => any,
  data: any,
): TwitterPost[] | undefined {
  const pathToItems = (instructions: any): any => {
    const addEntries = R.pipe(
      R.find(R.pathEq('TimelineAddEntries', ['type'])),
      R.defaultTo({}),
      R.prop('entries'),
      R.defaultTo([]),
    )(instructions);

    const addToModuleItems = R.pipe(
      R.find(R.pathEq('TimelineAddToModule', ['type'])),
      R.defaultTo({}),
      R.prop('moduleItems'),
      R.defaultTo([]),
    )(instructions);

    // 模式1：从 TimelineTimelineModule 中提取（UserMedia 模式）
    const moduleEntry = R.find(
      R.pathEq('TimelineTimelineModule', ['content', 'entryType']),
    )(addEntries);
    if (moduleEntry) {
      return R.pipe(
        R.path<any>(['content', 'items']),
        R.defaultTo([]),
        R.map(
          R.pipe(
            R.path(['item', 'itemContent', 'tweet_results', 'result']),
            R.ifElse<any, any, any>(
              R.propEq('TweetWithVisibilityResults', '__typename'),
              R.prop('tweet'),
              R.identity,
            ),
          ),
        ),
      )(moduleEntry);
    }

    // 模式2：从 TimelineAddToModule 中提取
    if (addToModuleItems.length > 0) {
      return R.map(
        R.pipe(
          R.path(['item', 'itemContent', 'tweet_results', 'result']),
          R.ifElse<any, any, any>(
            R.propEq('TweetWithVisibilityResults', '__typename'),
            R.prop('tweet'),
            R.identity,
          ),
        ),
      )(addToModuleItems);
    }

    // 模式3：从独立 tweet 条目中提取（Likes/Bookmarks 模式）
    return R.pipe(
      R.filter<any>((entry: any) => {
        const entryId: string = entry.entryId || '';
        return entryId.startsWith('tweet-') || entryId.startsWith('sq-I-t-');
      }),
      R.map<any, any>((entry: any) => {
        const result = R.path(
          ['content', 'itemContent', 'tweet_results', 'result'],
          entry,
        );
        if (R.propEq('TweetWithVisibilityResults', '__typename')(result)) {
          return result?.tweet;
        }
        return result;
      }),
    )(addEntries);
  };

  return R.pipe(
    pathToInstructions,
    R.ifElse(
      R.isNil,
      R.always([]),
      R.pipe(pathToItems, R.filter(R.isNotNil), mapTwitterPosts),
    ),
  )(data);
}

/**
 * 从 Timeline instructions 中提取下一页游标（通用逻辑）
 * 兼容两种模式：
 * 1. cursorType = 'Bottom'（标准）
 * 2. entryId 以 cursor-bottom- 开头（备用）
 */
function extractCursorFromInstructions(
  pathToInstructions: (data: any) => any,
  data: any,
): string | null {
  const entries: any[] | undefined = R.pipe(
    pathToInstructions,
    R.find(R.pathEq('TimelineAddEntries', ['type'])),
    R.defaultTo({}),
    R.prop('entries'),
  )(data);

  if (!entries) return null;

  // 模式1：cursorType = 'Bottom'
  const byCursorType = R.find(R.pathEq('Bottom', ['content', 'cursorType']))(entries);
  if (byCursorType) {
    return R.path(['content', 'value'], byCursorType) ?? null;
  }

  // 模式2：entryId 以 cursor-bottom- 开头
  const byEntryId = R.find((entry: any) => {
    const entryId: string = entry.entryId || '';
    return entryId.startsWith('cursor-bottom-');
  })(entries);

  if (byEntryId) {
    return R.path(['content', 'value'], byEntryId)
      ?? R.path(['content', 'itemContent', 'value'], byEntryId)
      ?? null;
  }

  return null;
}
