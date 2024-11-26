import Navbar from "./ui/components/Navbar";
import AudioTracks from "./ui/components/AudioTracks";

function App() {
  return (
    <main class="flex flex-col w-screen h-screen overflow-clip">
      {/* nav header */}
      <section>
        <Navbar />
      </section>

      {/* content */}
      <section class="overflow-auto flex-1">
        <AudioTracks />
      </section>
    </main>
  );
}

export default App;
