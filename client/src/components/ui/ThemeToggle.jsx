import { Sun, Moon } from 'lucide-react';
import './ThemeToggle.css';
import { useTheme } from '../../hooks/useTheme';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      className="theme-toggle-btn"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}

export default ThemeToggle;
