// Small helpers shared by the success-stories admin and public pages.
export const youtubeThumb = (videoId) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

export const formatStoryDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

// Cover image if set, otherwise the YouTube thumbnail.
export const storyImage = (story) =>
  story.cover_image_url || (story.youtube_video_id ? youtubeThumb(story.youtube_video_id) : null);

// Rough reading time in minutes for an article's HTML (null when there is no article text).
export const readingMinutes = (html) => {
  const words = (html || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return words ? Math.max(1, Math.ceil(words / 200)) : null;
};
