import { NavLink, Route, Routes } from "react-router-dom";
import CharacterList from "./pages/CharacterList";
import CharacterSheet from "./pages/CharacterSheet";
import Homebrew from "./pages/Homebrew";
import CharacterCreator from "./pages/CharacterCreator";
import Settings from "./pages/Settings";
import PrintSheet from "./pages/PrintSheet";
import { DiceTray, RollProvider } from "./components/dice";

export default function App() {
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-1.5 text-sm transition ${isActive ? "bg-ink-800 text-accent-400" : "text-ink-400 hover:text-ink-200"}`;
  return (
    <RollProvider>
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 print:hidden border-b border-ink-800 bg-ink-950/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2.5">
          <NavLink to="/" className="mr-auto whitespace-nowrap font-display text-lg font-bold tracking-wide text-accent-400 sm:mr-4">⚔ <span className="hidden sm:inline">Character Vault</span></NavLink>
          <NavLink to="/" end className={link}>Characters</NavLink>
          <NavLink to="/homebrew" className={link}>Homebrew</NavLink>
          <NavLink to="/settings" className={link}>Sources</NavLink>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 print:max-w-none print:p-0">
        <Routes>
          <Route path="/" element={<CharacterList />} />
          <Route path="/characters/:id" element={<CharacterSheet />} />
          <Route path="/characters/:id/print" element={<PrintSheet />} />
          <Route path="/homebrew" element={<Homebrew />} />
          <Route path="/new" element={<CharacterCreator />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <DiceTray />
    </div>
    </RollProvider>
  );
}
