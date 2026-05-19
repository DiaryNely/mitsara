<?php

class Mon_Order_StateFrontUpdateModuleFrontController extends ModuleFrontController
{
    public function initContent()
    {
        // -- Sécurité optionnelle par token secret --
        // $secret = Tools::getValue('secret');
        // if ($secret !== 'VOTRE_TOKEN_SECRET') {
        //     die(json_encode(['error' => 'Unauthorized']));
        // }

        $idOrder      = (int) Tools::getValue('id_order');
        $idOrderState = (int) Tools::getValue('id_order_state');
        $rawDate      = trim((string) Tools::getValue('date_add', ''));
        $dateAdd      = ($rawDate !== '' && Validate::isDateFormat($rawDate)) ? $rawDate : '';

        if (!$idOrder || !$idOrderState) {
            die(json_encode(['error' => 'Paramètres manquants : id_order et id_order_state requis']));
        }

        $order = new Order($idOrder);
        if (!Validate::isLoadedObject($order)) {
            die(json_encode(['error' => 'Commande introuvable : id_order = ' . $idOrder]));
        }

        $orderState = new OrderState($idOrderState);
        if (!Validate::isLoadedObject($orderState)) {
            die(json_encode(['error' => 'Statut introuvable : id_order_state = ' . $idOrderState]));
        }

        $history           = new OrderHistory();
        $history->id_order = $order->id;
        $history->changeIdOrderState($idOrderState, $order);
        if ($dateAdd !== '') {
            $history->date_add = $dateAdd;
        }
        $history->addWithemail(true);

        if ($dateAdd !== '' && $history->id) {
            Db::getInstance()->update(
                'order_history',
                ['date_add' => pSQL($dateAdd)],
                'id_order_history = ' . (int) $history->id
            );
        }

        die(json_encode([
            'success'         => true,
            'id_order'        => $idOrder,
            'id_order_state'  => $idOrderState,
            'new_state_name'  => $orderState->name[(int) Context::getContext()->language->id] ?? '',
        ]));
    }
}