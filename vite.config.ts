import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// Ensure `.env` in the repo root is always picked up (fixes missing PUBLIC_* in some setups).
	envDir: '.',
	plugins: [sveltekit()]
});
