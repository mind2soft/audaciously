import Navbar from "./ui/components/Navbar";
// import AudioTracks from "./ui/components/AudioTracks";
import AudioTracksProvider from "./ui/components/providers/AudioTracksProvider";
import AudioRecorderProvider from "./ui/components/providers/AudioRecorderProvider";
import AudioPlayerProvider from "./ui/components/providers/AudioPlayerProvider";

function App() {
  return (
    <main class="flex flex-col w-screen h-screen overflow-clip">
      <AudioTracksProvider>
        <AudioRecorderProvider>
          <AudioPlayerProvider>
            {/* nav header */}
            <section>
              <Navbar />
            </section>

            {/* content */}
            <section class="overflow-auto flex-1">
              {/*<AudioTracks />*/}
            </section>
          </AudioPlayerProvider>
        </AudioRecorderProvider>
      </AudioTracksProvider>
    </main>
  );
}

export default App;
