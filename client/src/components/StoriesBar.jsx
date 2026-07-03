import { useState, useEffect, useRef } from 'react';
import { storiesApi } from '../api';
import Avatar from './Avatar';
import { Icon } from './icons';
import './StoriesBar.css';

export default function StoriesBar({ user, token }) {
  const [feed, setFeed] = useState([]);
  const [viewer, setViewer] = useState(null);
  const fileRef = useRef(null);

  const load = () => {
    storiesApi.feed(token).then(setFeed).catch(() => setFeed([]));
  };

  useEffect(() => {
    load();
  }, [token]);

  async function publish(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await storiesApi.publish(token, file);
      load();
    } catch {
      /* ignore */
    }
    e.target.value = '';
  }

  function openStory(entry, index = 0) {
    setViewer({ entry, index });
    storiesApi.view(token, entry.stories[index].id).catch(() => {});
  }

  function nextStory() {
    if (!viewer) return;
    const { entry, index } = viewer;
    if (index + 1 < entry.stories.length) {
      openStory(entry, index + 1);
    } else {
      setViewer(null);
      load();
    }
  }

  const myEntry = feed.find((f) => f.userId === user.id);

  return (
    <>
      <div className="stories-bar">
        <button type="button" className="story-add" onClick={() => fileRef.current?.click()}>
          <Avatar
            name={user.displayName}
            color={user.avatarColor}
            avatarUrl={user.avatarUrl}
            avatarVersion={user.avatarVersion}
            size={52}
          />
          <span className="story-add-badge">+</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={publish} />

        {feed
          .filter((f) => f.userId !== user.id)
          .map((entry) => (
            <button
              key={entry.userId}
              type="button"
              className={`story-ring ${entry.hasUnviewed ? 'unviewed' : ''}`}
              onClick={() => openStory(entry, 0)}
            >
              <Avatar
                name={entry.displayName}
                color={entry.avatarColor}
                avatarUrl={entry.avatarUrl}
                avatarVersion={entry.avatarVersion}
                size={48}
              />
            </button>
          ))}
      </div>

      {viewer && (
        <div className="story-viewer" onClick={() => setViewer(null)}>
          <div className="story-viewer-inner" onClick={(e) => e.stopPropagation()}>
            <header>
              <span>{viewer.entry.displayName}</span>
              <button type="button" className="icon-btn" onClick={() => setViewer(null)}>
                <Icon name="close" size={22} />
              </button>
            </header>
            {viewer.entry.stories[viewer.index]?.mediaType === 'video' ? (
              <video
                src={viewer.entry.stories[viewer.index].mediaUrl}
                controls
                autoPlay
                className="story-media"
              />
            ) : (
              <img
                src={viewer.entry.stories[viewer.index].mediaUrl}
                alt=""
                className="story-media"
              />
            )}
            <button type="button" className="story-next" onClick={nextStory}>
              Далее
            </button>
          </div>
        </div>
      )}
    </>
  );
}
