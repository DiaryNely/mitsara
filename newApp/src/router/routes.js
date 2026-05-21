import DashboardView from '../views/DashboardView.vue'
import OrdersView from '../views/orders/OrdersView.vue'
import ResetView from '../views/reset/ResetView.vue'
import LoginView from '../views/auth/LoginView.vue'
import ImportView from '../views/import/ImportView.vue'
import StockAddView from '../views/stock/StockAddView.vue'
import StockHistoryView from '../views/stock/StockHistoryView.vue'
import FrontHomeView from '../views/front/FrontHomeView.vue'
import FrontProductsView from '../views/front/FrontProductsView.vue'
import FrontProductDetailView from '../views/front/FrontProductDetailView.vue'
import FrontCartView from '../views/front/FrontCartView.vue'
import FrontCheckoutView from '../views/front/FrontCheckoutView.vue'
import FrontOrdersView from '../views/front/FrontOrdersView.vue'
import FrontOrderDetailView from '../views/front/FrontOrderDetailView.vue'
import FrontDuplicateOrderView from '../views/front/FrontDuplicateOrderView.vue'
import FrontLoginView from '../views/front/FrontLoginView.vue'
import { beneficeRoute } from '../views/benefice/beneficeRoute'

const routes = [
	{
		path: '/login',
		name: 'login',
		component: LoginView,
		meta: { requiresAuth: false },
	},
	{
		path: '/',
		redirect: '/dashboard',
	},
	{
		path: '/dashboard',
		name: 'dashboard',
		component: DashboardView,
		meta: { requiresAuth: true },
	},
	{
		path: '/orders',
		name: 'orders',
		component: OrdersView,
		meta: { requiresAuth: true },
	},
	{
		path: '/reset',
		name: 'reset',
		component: ResetView,
		meta: { requiresAuth: true, permission: 'products' },
	},
	{
		path: '/import',
		name: 'import',
		component: ImportView,
		meta: { requiresAuth: true },
	},
	{
		path: '/stock',
		name: 'stock-add',
		component: StockAddView,
		meta: { requiresAuth: true },
	},
	{
		path: '/stock-history',
		name: 'stock-history',
		component: StockHistoryView,
		meta: { requiresAuth: true },
	},
	{
		path: '/front',
		name: 'front-home',
		component: FrontHomeView,
		meta: { requiresAuth: false, layout: 'front' },
	},
	{
		path: '/front/products',
		name: 'front-products',
		component: FrontProductsView,
		meta: { requiresAuth: false, layout: 'front' },
	},
	{
		path: '/front/products/:id',
		name: 'front-product-detail',
		component: FrontProductDetailView,
		meta: { requiresAuth: false, layout: 'front' },
	},
	{
		path: '/front/cart',
		name: 'front-cart',
		component: FrontCartView,
		meta: { requiresAuth: false, layout: 'front' },
	},
	{
		path: '/front/checkout',
		name: 'front-checkout',
		component: FrontCheckoutView,
		meta: { requiresAuth: false, layout: 'front', frontAuth: true },
	},
	{
		path: '/front/login',
		name: 'front-login',
		component: FrontLoginView,
		meta: { requiresAuth: false, layout: 'front' },
	},
	{
		path: '/front/orders',
		name: 'front-orders',
		component: FrontOrdersView,
		meta: { requiresAuth: false, layout: 'front', frontAuth: true },
	},
	{
		path: '/front/orders/:id',
		name: 'front-order-detail',
		component: FrontOrderDetailView,
		meta: { requiresAuth: false, layout: 'front', frontAuth: true },
	},
	{
		path: '/front/orders/:id/duplicate',
		name: 'front-order-duplicate',
		component: FrontDuplicateOrderView,
		meta: { requiresAuth: false, layout: 'front', frontAuth: true },
	},
	beneficeRoute,
]

export default routes
