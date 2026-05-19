// views/benefice/beneficeRoute.js
//
// Définition de route prête à l'emploi pour la fonctionnalité Bénéfice.
// NON branchée — à importer manuellement dans `src/router/routes.js` quand
// la fonctionnalité doit être activée.
//
// Exemple d'intégration :
//   import { beneficeRoute } from '../views/benefice/beneficeRoute'
//   const routes = [...existing, beneficeRoute]

import BeneficeView from './BeneficeView.vue'

export const beneficeRoute = {
  path: '/benefice',
  name: 'benefice',
  component: BeneficeView,
  meta: { requiresAuth: true },
}

export default beneficeRoute
