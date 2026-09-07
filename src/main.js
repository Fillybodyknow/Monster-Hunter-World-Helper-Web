import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { installErrorCapture } from './services/diagnostics'

const app = createApp(App)

// ต้องติดตั้งก่อน mount เพื่อให้ดัก error ตอนแอปเริ่มทำงานได้ด้วย
installErrorCapture(app)

app.use(createPinia())
app.use(router)

app.mount('#app')
