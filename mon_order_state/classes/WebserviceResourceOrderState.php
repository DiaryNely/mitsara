<?php
/**
 * ObjectModel — décrit la structure de la ressource exposée à l'API.
 * PrestaShop s'en sert pour générer le schéma XML (blank / synopsis).
 */
class OrderStateUpdateWebserviceResource extends ObjectModel
{
    public $id_order;
    public $id_order_state;
    public $date_add;

    public static $definition = [
        'table'   => 'orders',           // table existante, pas de création nécessaire
        'primary' => 'id_order',
        'fields'  => [
            'id_order' => [
                'type'     => self::TYPE_INT,
                'validate' => 'isUnsignedId',
                'required' => true,
            ],
            'id_order_state' => [
                'type'     => self::TYPE_INT,
                'validate' => 'isUnsignedId',
                'required' => true,
            ],
            'date_add' => [
                'type'     => self::TYPE_DATE,
                'validate' => 'isDateFormat',
                'required' => false,   // optionnel : si absent → now()
            ],
        ],
    ];

    protected $webserviceParameters = [
        'objectNodeName'  => 'order_state_update',
        'objectsNodeName' => 'order_state_updates',
        'fields'          => [
            'id_order'       => [],
            'id_order_state' => [],
            'date_add'       => [],   // format attendu : Y-m-d H:i:s
        ],
        'associations' => [],
    ];
}

/**
 * Gestionnaire métier — contient toute la logique HTTP (POST / GET / HEAD).
 * Le nom DOIT suivre le pattern : WebserviceSpecificManagement + <CamelCase de la clé du hook>
 * Clé du hook : 'order_state_update'  →  OrderStateUpdate  →  WebserviceSpecificManagementOrderStateUpdate
 */
class WebserviceSpecificManagementOrderStateUpdate implements WebserviceSpecificManagementInterface
{
    protected $output    = '';
    protected $ws_object;
    protected $objOutput;

    /* ── Interface obligatoire ── */
    public function setObjectsArray(&$objs) {}
    public function getObjectsArray()                              { return []; }
    public function setWsObject(WebserviceRequest $obj)            { $this->ws_object = $obj; return $this; }
    public function getWsObject()                                  { return $this->ws_object; }
    public function getContent()                                   { return $this->output; }
    public function setObjectOutput(WebserviceOutputBuilder $obj)  { $this->objOutput = $obj; return $this; }
    public function getObjectOutput()                              { return $this->objOutput; }

    /* ── Point d'entrée principal ── */
    public function manage()
    {
        $method = $_SERVER['REQUEST_METHOD'];

        if ($method === 'GET' || $method === 'HEAD') {
            return $this->manageGetAndHead();
        }

        if ($method !== 'POST') {
            throw new WebserviceException('Seules les méthodes GET et POST sont acceptées', [405, 405]);
        }

        return $this->managePost();
    }

    /* ── Constantes des états métier ── */
    const STATE_PAID             = 2;   // Paiement accepté
    const STATE_DELIVERED        = 5;   // Livré
    const STATE_CANCELLED        = 6;   // Annulé
    const STATE_REMOTE_PAYMENT   = 11;   // Paiement à distance (pass-partout)
    const STATE_ERROR_PAYMENT   = 8;   // ERREUR PAYEMENT

    /**
     * Matrice des transitions autorisées par current_state.
     *
     * current_state => [états cibles autorisés]
     * null (clé absente) = transition bloquée
     *
     * STATE_REMOTE_PAYMENT (8) : toutes transitions autorisées → géré séparément.
     * STATE_DELIVERED (5)      : aucune transition autorisée.
     */
    protected static $allowedTransitions = [
        self::STATE_PAID      => [self::STATE_DELIVERED, self::STATE_CANCELLED],
        self::STATE_CANCELLED => [self::STATE_PAID],
        // STATE_REMOTE_PAYMENT : autorisé vers tout, testé dans validateTransition()
        // STATE_DELIVERED      : absent = bloqué
    ];

    /**
     * Lève une WebserviceException si la transition current → target n'est pas autorisée.
     */
    protected function validateTransition(int $currentState, int $targetState)
    {
        // État 8 : passe-partout, toutes cibles acceptées
        if ($currentState === self::STATE_REMOTE_PAYMENT || $currentState === self::STATE_ERROR_PAYMENT) {
            return;
        }

        // État 5 : aucune transition possible
        if ($currentState === self::STATE_DELIVERED) {
            throw new WebserviceException(
                'Transition impossible : une commande livrée (état 5) ne peut plus être modifiée.',
                [422, 422]
            );
        }

        // Autres états : vérification dans la matrice
        $allowed = self::$allowedTransitions[$currentState] ?? [];
        if (!in_array($targetState, $allowed, true)) {
            throw new WebserviceException(
                sprintf(
                    'Transition non autorisée : état actuel %d → état demandé %d. Transitions autorisées : [%s].',
                    $currentState,
                    $targetState,
                    implode(', ', $allowed) ?: 'aucune'
                ),
                [422, 422]
            );
        }
    }

    /* ── POST : changement d'état + mouvements de stock ── */
    protected function managePost()
    {
        $body = $this->getRequestBody();

        $idOrder      = (int) ($body['id_order']       ?? 0);
        $idOrderState = (int) ($body['id_order_state'] ?? 0);

        // date_add optionnel : si absent ou invalide → maintenant
        $rawDate = trim($body['date_add'] ?? '');
        $dateAdd = ($rawDate !== '' && Validate::isDateFormat($rawDate))
            ? $rawDate
            : date('Y-m-d H:i:s');

        if (!$idOrder || !$idOrderState) {
            throw new WebserviceException('id_order et id_order_state sont obligatoires', [400, 400]);
        }

        $order = new Order($idOrder);
        if (!Validate::isLoadedObject($order)) {
            throw new WebserviceException('Commande introuvable : id_order = ' . $idOrder, [404, 404]);
        }

        $orderState = new OrderState($idOrderState);
        if (!Validate::isLoadedObject($orderState)) {
            throw new WebserviceException('Statut introuvable : id_order_state = ' . $idOrderState, [404, 404]);
        }

        // ── Vérification de la transition ───────────────────────────────────
        $this->validateTransition((int) $order->current_state, $idOrderState);

        // ── Changement d'état natif PS ──────────────────────────────────────
        $history           = new OrderHistory();
        $history->id_order = $order->id;
        $history->changeIdOrderState($idOrderState, $order);
        $history->date_add = $dateAdd;
        $history->addWithemail(true);

        if ($history->id) {
            Db::getInstance()->update(
                'order_history',
                ['date_add' => pSQL($dateAdd)],
                'id_order_history = ' . (int) $history->id
            );
        }

        // ── Mouvement stock_mvt si livraison ────────────────────────────────
        if ($idOrderState === self::STATE_DELIVERED) {
            $this->insertStockMovements($order->getProducts(), $dateAdd);
        }

        // ── Réponse ─────────────────────────────────────────────────────────
        $resource                 = $this->buildResourceObject();
        $resource->id             = $idOrder;
        $resource->id_order       = $idOrder;
        $resource->id_order_state = $idOrderState;
        $resource->date_add       = $dateAdd;

        $this->output = $this->objOutput->getContent(
            ['empty' => $this->buildResourceObject(), $resource],
            null,
            'full',
            $this->ws_object->depth,
            WebserviceOutputBuilder::VIEW_DETAILS
        );

        return true;
    }

    /**
     * STATE 5 — Livré : insère un mouvement dans stock_mvt (traçabilité physique).
     * PrestaShop gère déjà decrease/increase via changeIdOrderState(),
     * ce helper ajoute uniquement la ligne dans stock_mvt.
     */
    protected function insertStockMovements(array $products, string $dateAdd)
    {
        $db = Db::getInstance();
        $reasonId = $this->resolveOrderOutReasonId();

        foreach ($products as $product) {
            $idProduct          = (int) $product['product_id'];
            $idProductAttribute = (int) $product['product_attribute_id'];
            $qty                = (int) $product['product_quantity'];

            // Récupération de l'id_stock_available (= id_stock dans stock_mvt)
            $idStock = (int) $db->getValue(
                'SELECT id_stock_available
                 FROM ' . _DB_PREFIX_ . 'stock_available
                 WHERE id_product = ' . $idProduct . '
                 AND id_product_attribute = ' . $idProductAttribute
            );

            if (!$idStock) {
                continue;   // produit sans stock géré, on passe
            }

            $db->insert('stock_mvt', [
                'id_stock'            => $idStock,
                'id_order'            => (int) $product['id_order'],
                'id_supply_order'     => null,
                'id_stock_mvt_reason' => $reasonId,
                'id_employee'         => 0,
                'employee_firstname'  => 'API',
                'employee_lastname'   => 'externe',
                'physical_quantity'   => $qty,
                'date_add'            => $dateAdd,
                'sign'                => -1,          // sortie physique
                'price_te'            => 0,
                'last_wa'             => 0,
                'current_wa'          => 0,
                'referer'             => 0,
            ]);
        }
    }

    protected function resolveOrderOutReasonId()
    {
        $db = Db::getInstance();

        // Prefer a decrease reason to avoid "augmentation" type in stock movements.
        $reasonId = (int) Configuration::get('PS_STOCK_MVT_REASON_DEFAULT');
        if ($reasonId > 0) {
            $sign = (int) $db->getValue(
                'SELECT sign FROM ' . _DB_PREFIX_ . 'stock_mvt_reason
                 WHERE id_stock_mvt_reason = ' . (int) $reasonId
            );
            if ($sign === -1) {
                return $reasonId;
            }
        }

        $reasonId = (int) $db->getValue(
            'SELECT id_stock_mvt_reason
             FROM ' . _DB_PREFIX_ . 'stock_mvt_reason
             WHERE sign = -1
             ORDER BY id_stock_mvt_reason ASC'
        );

        return $reasonId ?: 3;
    }

    /* ── GET / HEAD : schéma ou liste fictive ── */
    protected function manageGetAndHead()
    {
        $resource = $this->buildResourceObject();
        $this->ws_object->resourceConfiguration = $resource->getWebserviceParameters();

        // ?schema=blank ou ?schema=synopsis
        if (isset($this->ws_object->urlFragments['schema'])) {
            $schema = $this->ws_object->urlFragments['schema'];
            if (!in_array($schema, ['blank', 'synopsis'])) {
                throw new WebserviceException('schema doit être blank ou synopsis', [400, 400]);
            }

            $this->output = $this->objOutput->getContent(
                ['empty' => $resource],
                $schema,
                'full',
                $this->ws_object->depth,
                WebserviceOutputBuilder::VIEW_DETAILS
            );

            return true;
        }

        if (!$this->ws_object->setFieldsToDisplay()) {
            return false;
        }

        // Réponse fictive pour un GET sans paramètre
        $resource->id             = 1;
        $resource->id_order       = 0;
        $resource->id_order_state = 0;

        $this->output = $this->objOutput->getContent(
            ['empty' => $this->buildResourceObject(), $resource],
            null,
            $this->ws_object->fieldsToDisplay,
            $this->ws_object->depth,
            WebserviceOutputBuilder::VIEW_LIST
        );

        return true;
    }

    /* ── Helpers ── */
    protected function buildResourceObject()
    {
        return new OrderStateUpdateWebserviceResource();
    }

    /**
     * Accepte JSON ou XML (même format que votre WebserviceResourceStockUpdate).
     */
    protected function getRequestBody()
    {
        $rawBody = file_get_contents('php://input');
        $json    = json_decode($rawBody, true);

        if (is_array($json)) {
            return $json;
        }

        if (trim($rawBody) === '') {
            return [];
        }

        $xml = @simplexml_load_string($rawBody);
        if ($xml === false) {
            return [];
        }

        if (isset($xml->order_state_update)) {
            $xml = $xml->order_state_update;
        }

        return [
            'id_order'       => (string) $xml->id_order,
            'id_order_state' => (string) $xml->id_order_state,
            'date_add'       => (string) $xml->date_add,
        ];
    }
}

/**
 * ObjectModel — schema pour insertion d'un mouvement de stock.
 */
class StockMovementInsertWebserviceResource extends ObjectModel
{
    public $id_stock;
    public $id_product;
    public $id_product_attribute;
    public $physical_quantity;
    public $sign;
    public $date_add;
    public $id_stock_mvt_reason;

    public static $definition = [
        'table'   => 'stock_mvt',
        'primary' => 'id_stock_mvt',
        'fields'  => [
            'id_stock' => [
                'type'     => self::TYPE_INT,
                'validate' => 'isUnsignedId',
                'required' => false,
            ],
            'id_product' => [
                'type'     => self::TYPE_INT,
                'validate' => 'isUnsignedId',
                'required' => false,
            ],
            'id_product_attribute' => [
                'type'     => self::TYPE_INT,
                'validate' => 'isUnsignedId',
                'required' => false,
            ],
            'physical_quantity' => [
                'type'     => self::TYPE_INT,
                'validate' => 'isUnsignedInt',
                'required' => true,
            ],
            'sign' => [
                'type'     => self::TYPE_INT,
                'validate' => 'isInt',
                'required' => true,
            ],
            'date_add' => [
                'type'     => self::TYPE_DATE,
                'validate' => 'isDateFormat',
                'required' => false,
            ],
            'id_stock_mvt_reason' => [
                'type'     => self::TYPE_INT,
                'validate' => 'isUnsignedId',
                'required' => false,
            ],
        ],
    ];

    protected $webserviceParameters = [
        'objectNodeName'  => 'stock_movement_insert',
        'objectsNodeName' => 'stock_movement_inserts',
        'fields'          => [
            'id_stock'              => [],
            'id_product'            => [],
            'id_product_attribute'  => [],
            'physical_quantity'     => [],
            'sign'                  => [],
            'date_add'              => [],
            'id_stock_mvt_reason'   => [],
        ],
        'associations' => [],
    ];
}

/**
 * Webservice custom — insertion stock_mvt avec date_add controlee.
 */
class WebserviceSpecificManagementStockMovementInsert implements WebserviceSpecificManagementInterface
{
    protected $output    = '';
    protected $ws_object;
    protected $objOutput;

    public function setObjectsArray(&$objs) {}
    public function getObjectsArray()                              { return []; }
    public function setWsObject(WebserviceRequest $obj)            { $this->ws_object = $obj; return $this; }
    public function getWsObject()                                  { return $this->ws_object; }
    public function getContent()                                   { return $this->output; }
    public function setObjectOutput(WebserviceOutputBuilder $obj)  { $this->objOutput = $obj; return $this; }
    public function getObjectOutput()                              { return $this->objOutput; }

    public function manage()
    {
        $method = $_SERVER['REQUEST_METHOD'];

        if ($method === 'GET' || $method === 'HEAD') {
            return $this->manageGetAndHead();
        }

        if ($method !== 'POST') {
            throw new WebserviceException('Seules les methodes GET et POST sont acceptees', [405, 405]);
        }

        return $this->managePost();
    }

    protected function managePost()
    {
        $body = $this->getRequestBody();

        $idStock             = (int) ($body['id_stock'] ?? 0);
        $idProduct           = (int) ($body['id_product'] ?? 0);
        $idProductAttribute  = (int) ($body['id_product_attribute'] ?? 0);
        $qty                 = (int) ($body['physical_quantity'] ?? 0);
        $sign                = (int) ($body['sign'] ?? 1);
        $reasonId            = (int) ($body['id_stock_mvt_reason'] ?? 1);

        $rawDate = trim($body['date_add'] ?? '');
        $dateAdd = ($rawDate !== '' && Validate::isDateFormat($rawDate))
            ? $rawDate
            : date('Y-m-d H:i:s');

        if ($qty <= 0) {
            throw new WebserviceException('physical_quantity doit etre > 0', [400, 400]);
        }

        if ($sign !== -1 && $sign !== 1) {
            $sign = 1;
        }

        if (!$idStock) {
            $idStock = $this->resolveStockId($idProduct, $idProductAttribute);
        }

        if (!$idStock) {
            throw new WebserviceException('Stock introuvable pour ce produit / declinaison', [404, 404]);
        }

        $db = Db::getInstance();

        $db->insert('stock_mvt', [
            'id_stock'            => (int) $idStock,
            'id_order'            => 0,
            'id_supply_order'     => 0,
            'id_stock_mvt_reason' => $reasonId ?: 1,
            'id_employee'         => 0,
            'employee_firstname'  => 'API',
            'employee_lastname'   => 'externe',
            'physical_quantity'   => $qty,
            'date_add'            => $dateAdd,
            'sign'                => $sign,
            'price_te'            => 0,
            'last_wa'             => 0,
            'current_wa'          => 0,
            'referer'             => 0,
        ]);

        $idStockMvt = (int) $db->Insert_ID();

        $resource = $this->buildResourceObject();
        $resource->id                  = $idStockMvt;
        $resource->id_stock            = $idStock;
        $resource->id_product          = $idProduct;
        $resource->id_product_attribute = $idProductAttribute;
        $resource->physical_quantity   = $qty;
        $resource->sign                = $sign;
        $resource->date_add            = $dateAdd;
        $resource->id_stock_mvt_reason = $reasonId ?: 1;

        $this->output = $this->objOutput->getContent(
            ['empty' => $this->buildResourceObject(), $resource],
            null,
            'full',
            $this->ws_object->depth,
            WebserviceOutputBuilder::VIEW_DETAILS
        );

        return true;
    }

    protected function manageGetAndHead()
    {
        $resource = $this->buildResourceObject();
        $this->ws_object->resourceConfiguration = $resource->getWebserviceParameters();

        if (isset($this->ws_object->urlFragments['schema'])) {
            $schema = $this->ws_object->urlFragments['schema'];
            if (!in_array($schema, ['blank', 'synopsis'])) {
                throw new WebserviceException('schema doit etre blank ou synopsis', [400, 400]);
            }

            $this->output = $this->objOutput->getContent(
                ['empty' => $resource],
                $schema,
                'full',
                $this->ws_object->depth,
                WebserviceOutputBuilder::VIEW_DETAILS
            );

            return true;
        }

        if (!$this->ws_object->setFieldsToDisplay()) {
            return false;
        }

        $resource->id                = 1;
        $resource->id_stock          = 0;
        $resource->physical_quantity = 0;
        $resource->sign              = 1;
        $resource->date_add          = date('Y-m-d H:i:s');

        $this->output = $this->objOutput->getContent(
            ['empty' => $this->buildResourceObject(), $resource],
            null,
            $this->ws_object->fieldsToDisplay,
            $this->ws_object->depth,
            WebserviceOutputBuilder::VIEW_LIST
        );

        return true;
    }

    protected function buildResourceObject()
    {
        return new StockMovementInsertWebserviceResource();
    }

    protected function resolveStockId($idProduct, $idProductAttribute)
    {
        if (!$idProduct) {
            return 0;
        }

        $db = Db::getInstance();
        return (int) $db->getValue(
            'SELECT id_stock_available
             FROM ' . _DB_PREFIX_ . 'stock_available
             WHERE id_product = ' . (int) $idProduct . '
             AND id_product_attribute = ' . (int) $idProductAttribute
        );
    }

    protected function getRequestBody()
    {
        $rawBody = file_get_contents('php://input');
        $json    = json_decode($rawBody, true);

        if (is_array($json)) {
            return $json;
        }

        if (trim($rawBody) === '') {
            return [];
        }

        $xml = @simplexml_load_string($rawBody);
        if ($xml === false) {
            return [];
        }

        if (isset($xml->stock_movement_insert)) {
            $xml = $xml->stock_movement_insert;
        }

        return [
            'id_stock'             => (string) $xml->id_stock,
            'id_product'           => (string) $xml->id_product,
            'id_product_attribute' => (string) $xml->id_product_attribute,
            'physical_quantity'    => (string) $xml->physical_quantity,
            'sign'                 => (string) $xml->sign,
            'date_add'             => (string) $xml->date_add,
            'id_stock_mvt_reason'  => (string) $xml->id_stock_mvt_reason,
        ];
    }
}