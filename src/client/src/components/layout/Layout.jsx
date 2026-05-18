import { ResizablePane } from './ResizablePane.jsx';
import { StatsBar }      from '../stats/index.js';
import { TranscriptPane } from '../transcript/index.js';
import { VideoPane }     from '../video/index.js';
import { WordTimeline }  from '../timeline/index.js';
import { Toolbar }       from '../toolbar/index.js';

export function Layout() {
  return (
    <div className="flex h-full flex-col bg-neutral-950">
      <StatsBar />
      <ResizablePane
        left={<TranscriptPane />}
        right={<VideoPane />}
      />
      <WordTimeline />
      <Toolbar />
    </div>
  );
}
