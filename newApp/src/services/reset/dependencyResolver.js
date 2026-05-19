const AUTO_INCLUDE_ASSOCIATIONS = {
  products: [
    'images',
    'combinations',
    'stock_availables',
    'product_customization_fields',
    'product_feature_values',
    'product_features',
    'product_option_values',
    'product_options',
    'tags',
    'product_suppliers',
    'attachments',
    'specific_prices',
    'specific_price_rules',
  ],
  orders: [
    'order_details',
    'order_cart_rules',
    'order_histories',
    'order_invoices',
    'order_payments',
    'order_slip',
    'order_carriers',
  ],
  customers: ['addresses', 'customer_messages', 'customer_threads', 'orders', 'carts'],
  carts: ['cart_rules'],
}

const CHILD_ASSOCIATIONS = {
  products: ['images', 'combinations', 'stock_availables', 'product_customization_fields'],
  orders: [
    'order_details',
    'order_cart_rules',
    'order_histories',
    'order_invoices',
    'order_payments',
    'order_slip',
    'order_carriers',
  ],
  customers: ['addresses', 'customer_messages', 'customer_threads'],
}

const FIELD_ID_TO_RESOURCE = {
  address: 'addresses',
  cart: 'carts',
  cart_rule: 'cart_rules',
  category: 'categories',
  combination: 'combinations',
  country: 'countries',
  currency: 'currencies',
  customer: 'customers',
  employee: 'employees',
  image: 'images',
  manufacturer: 'manufacturers',
  order: 'orders',
  order_detail: 'order_details',
  order_invoice: 'order_invoices',
  order_payment: 'order_payments',
  order_state: 'order_states',
  product: 'products',
  product_attribute: 'combinations',
  product_feature: 'product_features',
  product_feature_value: 'product_feature_values',
  product_option: 'product_options',
  product_option_value: 'product_option_values',
  product_supplier: 'product_suppliers',
  shop: 'shops',
  shop_group: 'shop_groups',
  state: 'states',
  stock_available: 'stock_availables',
  supplier: 'suppliers',
  tag: 'tags',
  tax: 'taxes',
  tax_rule: 'tax_rules',
  tax_rule_group: 'tax_rule_groups',
}

const normalizeResourceName = (value) => (value || '').trim()

const pluralize = (value) => {
  if (!value) {
    return ''
  }

  if (value.endsWith('y')) {
    return `${value.slice(0, -1)}ies`
  }

  if (value.endsWith('s')) {
    return `${value}es`
  }

  return `${value}s`
}

const inferResourceFromField = (fieldName) => {
  if (!fieldName || !fieldName.startsWith('id_')) {
    return ''
  }

  const key = fieldName.slice(3)
  if (FIELD_ID_TO_RESOURCE[key]) {
    return FIELD_ID_TO_RESOURCE[key]
  }

  if (key === 'parent') {
    return ''
  }

  return pluralize(key)
}

const addEdge = (edges, reasons, from, to, reason) => {
  if (!from || !to || from === to) {
    return
  }

  if (!edges.has(from)) {
    edges.set(from, new Set())
  }

  edges.get(from).add(to)

  const key = `${from}>>${to}`
  if (!reasons.has(key)) {
    reasons.set(key, new Set())
  }
  if (reason) {
    reasons.get(key).add(reason)
  }
}

const buildDependencyEdges = ({ schemas, availableResources }) => {
  const edges = new Map()
  const reasons = new Map()

  Object.values(schemas).forEach((schema) => {
    const resource = schema.resource

    schema.associations.forEach((assoc) => {
      const assocResource = normalizeResourceName(assoc.resource || assoc.name)
      if (!assocResource) {
        return
      }
      if (availableResources && !availableResources.has(assocResource)) {
        return
      }

      const isChild = (CHILD_ASSOCIATIONS[resource] || []).includes(assocResource)
      if (isChild) {
        addEdge(edges, reasons, assocResource, resource, `association:${assoc.name}`)
      } else {
        addEdge(edges, reasons, resource, assocResource, `association:${assoc.name}`)
      }
    })

    schema.fields.forEach((field) => {
      const inferred = normalizeResourceName(inferResourceFromField(field.name))
      if (!inferred || inferred === resource) {
        return
      }
      if (availableResources && !availableResources.has(inferred)) {
        return
      }

      addEdge(edges, reasons, resource, inferred, `field:${field.name}`)
    })
  })

  return { edges, reasons }
}

const topoSort = (nodes, edges) => {
  const inDegree = new Map()
  nodes.forEach((node) => inDegree.set(node, 0))

  edges.forEach((targets, from) => {
    if (!inDegree.has(from)) {
      return
    }
    targets.forEach((to) => {
      if (!inDegree.has(to)) {
        return
      }
      inDegree.set(to, inDegree.get(to) + 1)
    })
  })

  const queue = nodes.filter((node) => inDegree.get(node) === 0)
  const order = []

  while (queue.length) {
    const node = queue.shift()
    order.push(node)

    const targets = edges.get(node) || new Set()
    targets.forEach((to) => {
      inDegree.set(to, inDegree.get(to) - 1)
      if (inDegree.get(to) === 0) {
        queue.push(to)
      }
    })
  }

  const cycles = nodes.filter((node) => !order.includes(node))
  if (cycles.length) {
    cycles.sort().forEach((node) => order.push(node))
  }

  return { order, cycles }
}

const resolveResetPlan = ({ selected, schemas, availableResources }) => {
  const availableSet = availableResources ? new Set(availableResources) : null
  const selectedSet = new Set(selected)

  const { edges, reasons } = buildDependencyEdges({
    schemas,
    availableResources: availableSet,
  })

  const autoIncluded = new Set()

  selectedSet.forEach((resource) => {
    const schema = schemas[resource]
    if (!schema) {
      return
    }

    schema.associations.forEach((assoc) => {
      const assocResource = normalizeResourceName(assoc.resource || assoc.name)
      if (!assocResource) {
        return
      }
      if (availableSet && !availableSet.has(assocResource)) {
        return
      }

      const autoList = AUTO_INCLUDE_ASSOCIATIONS[resource] || []
      if (autoList.includes(assocResource)) {
        autoIncluded.add(assocResource)
      }
    })
  })

  const allResources = new Set([...selectedSet, ...autoIncluded])
  const filteredEdges = new Map()
  const dependencyEntries = []

  edges.forEach((targets, from) => {
    if (!allResources.has(from)) {
      return
    }

    targets.forEach((to) => {
      if (!allResources.has(to)) {
        return
      }

      if (!filteredEdges.has(from)) {
        filteredEdges.set(from, new Set())
      }
      filteredEdges.get(from).add(to)

      const key = `${from}>>${to}`
      const reasonSet = reasons.get(key) || new Set()
      dependencyEntries.push({
        from,
        to,
        reasons: Array.from(reasonSet),
      })
    })
  })

  const nodes = Array.from(allResources)
  const { order, cycles } = topoSort(nodes, filteredEdges)
  const deletionOrder = order.slice().reverse()

  return {
    selected: Array.from(selectedSet),
    autoIncluded: Array.from(autoIncluded),
    resources: nodes,
    edges: dependencyEntries,
    deletionOrder,
    cycles,
  }
}

export { resolveResetPlan, normalizeResourceName, inferResourceFromField }
