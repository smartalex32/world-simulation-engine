import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './ui/worldbuilder.css'
import './ui/worldSetup.css'
import './ui/map/mapWorkbench.css'

const root = document.getElementById('root')
if (!root) throw new Error('Application root is missing')
createRoot(root).render(<App />)
