import './index.css'
import ReactDOM from 'react-dom/client'
import { mountApp } from './bootstrapApp'
import type { ElectronAPI } from '../../shared/ipc'
import { createMockElectronAPI } from './api/mockElectronApi'

function hasElectronApi(): boolean {
	return typeof (window as Window & { electronAPI?: ElectronAPI }).electronAPI !== 'undefined'
}

const rootElement = document.getElementById('root') as HTMLElement

if (hasElectronApi()) {
	// Native Electron app
	mountApp(rootElement)
} else {
	// Web mode: inject mock API and run the full app
	const mockAPI = createMockElectronAPI()
	;(window as Window & { electronAPI?: ElectronAPI }).electronAPI = mockAPI
	mountApp(rootElement)
}
