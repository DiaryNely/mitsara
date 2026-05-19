import { createRouter, createWebHistory } from 'vue-router'
import routes from './routes'
import { authGuard, frontAuthGuard } from './guards'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(frontAuthGuard)
router.beforeEach(authGuard)

export default router
