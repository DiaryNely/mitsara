// api/combinations.js
import { getXmlClient } from './xmlClient'
import { xmlToJson, buildXML, readText, readAttr } from '../utils/xml'

/**
 * Crée une combinaison (déclinaison) pour un produit
 */
export async function createCombination(combinationData) {
  const client = getXmlClient()
  
  // Vérifier les données obligatoires
  if (!combinationData.productId) {
    throw new Error('productId est obligatoire')
  }
  if (!combinationData.attributeValues || combinationData.attributeValues.length === 0) {
    throw new Error('attributeValues est obligatoire')
  }
  
  // Construction XML avec minimal_quantity (obligatoire)
  const xmlObject = {
    prestashop: {
      combination: {
        id_product: combinationData.productId,
        reference: combinationData.reference || '',
        price: combinationData.price || 0,
        minimal_quantity: combinationData.minimal_quantity || 1,  // 🔑 OBLIGATOIRE
        associations: {
          product_option_values: {
            product_option_value: combinationData.attributeValues.map(av => ({ id: av.id }))
          }
        }
      }
    }
  }

  if (combinationData.quantity !== undefined && combinationData.quantity !== null) {
    xmlObject.prestashop.combination.quantity = combinationData.quantity
  }
  
  // Nettoyer les champs vides (optionnels)
  if (!combinationData.reference) {
    delete xmlObject.prestashop.combination.reference
  }
  
  const xml = buildXML(xmlObject)
  
  console.log('📤 XML combinaison:', xml)
  
  try {
    const response = await client.post('/combinations', xml)
    const json = xmlToJson(response.data)
    return readText(json.prestashop.combination.id)
  } catch (error) {
    if (error.response?.data) {
      console.error('❌ Réponse erreur:', error.response.data)
    }
    throw error
  }
}

/**
 * Met à jour le stock d'une combinaison
 */
export async function updateCombinationStock(combinationId, quantity, productId = null) {
  const client = getXmlClient()
  const getStockId = (stock) => readText(stock?.id) || readAttr(stock, 'id')

  // Récupérer d'abord le stock_available existant
  const response = await client.get(
    `/stock_availables?display=[id,id_product,id_product_attribute,id_shop,id_shop_group,depends_on_stock,out_of_stock]&filter[id_product_attribute]=${combinationId}`
  )
  const json = xmlToJson(response.data)
  
  let stockId = null
  const stocks = json.prestashop?.stock_availables?.stock_available
  if (stocks) {
    if (Array.isArray(stocks)) {
      stockId = getStockId(stocks[0])
    } else {
      stockId = getStockId(stocks)
    }
  }
  
  if (stockId) {
    const stockNode = Array.isArray(stocks) ? stocks[0] : stocks
    const idProduct = readText(stockNode?.id_product) || (productId ? String(productId) : '')
    const idProductAttribute = readText(stockNode?.id_product_attribute) || String(combinationId)
    const idShop = readText(stockNode?.id_shop) || '1'
    const idShopGroup = readText(stockNode?.id_shop_group) || '0'
    const dependsOnStock = readText(stockNode?.depends_on_stock) || '0'
    const outOfStock = readText(stockNode?.out_of_stock) || '2'

    if (!idProduct) {
      throw new Error('Produit introuvable pour la declinaison')
    }

    // Mettre à jour le stock existant
    const updateXml = buildXML({
      prestashop: {
        stock_available: {
          id: stockId,
          id_product: idProduct,
          id_product_attribute: idProductAttribute,
          id_shop: idShop,
          id_shop_group: idShopGroup,
          depends_on_stock: dependsOnStock,
          out_of_stock: outOfStock,
          quantity: quantity
        }
      }
    })
    await client.put(`/stock_availables/${stockId}`, updateXml)
  } else {
    if (!productId) {
      throw new Error('Stock introuvable pour cette declinaison')
    }

    // Stock introuvable: eviter le POST (souvent refuse), remonter l'erreur.
    throw new Error(`Stock indisponible pour la declinaison ${combinationId}`)
  }
}

/**
 * Supprime une combinaison
 */
export async function deleteCombination(id) {
  const client = getXmlClient()
  await client.delete(`/combinations/${id}`)
}