document.addEventListener("DOMContentLoaded", function () {
    loadShoppingList(); // Carica la lista all'avvio
});

// Funzione per aggiungere un nuovo elemento alla lista
function addItem() {
    const itemName = document.getElementById("item_name").value;
    const location = document.getElementById("location").value;
    const quantity = document.getElementById("quantity").value;
    const neededBy = document.getElementById("needed_by").value;

    if (!itemName || !location || !quantity || quantity <= 0) {
        alert("Compila tutti i campi obbligatori con valori validi.");
        return;
    }

    fetch("/todolist/insert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            item_name: itemName,
            location: location,
            quantity: parseInt(quantity),
            timestamp: neededBy || null
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.message === "Documents inserted successfully") {
            document.getElementById("item_name").value = "";
            document.getElementById("location").value = "";
            document.getElementById("quantity").value = "";
            document.getElementById("needed_by").value = "";
            loadShoppingList(); // Ricarica la lista dopo aver aggiunto l'elemento
        }
    })
    .catch(error => console.error("Errore nell'aggiunta dell'elemento:", error));
}

// Funzione per eliminare un elemento dalla lista
function deleteItem(id) {
    fetch(`/todolist/delete/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" }
    })
    .then(response => {
        if (!response.ok) {  // Se la risposta non è OK
            throw new Error('Errore nell\'eliminazione dell\'elemento');
        }
        return response.json();
    })
    .then(data => {
        if (data.message.includes("successfully")) {
            loadShoppingList(); // Ricarica la lista dopo la cancellazione
        }
    })
    .catch(error => {
        console.error("Errore nell'eliminazione dell'elemento:", error);
    });
}

// Funzione per caricare la lista della spesa
function loadShoppingList() {
    fetch("/todolist/today")
    .then(response => response.json())
    .then(data => {
        const tableBody = document.getElementById("shopping_list_body");
        tableBody.innerHTML = ""; // Pulisce la tabella prima di riempirla

        if (data.length === 0) {
            tableBody.innerHTML = "<tr><td colspan='5'>Nessun elemento nella lista.</td></tr>";
            return;
        }

        // Popola la tabella con gli elementi
        data.forEach(item => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${item.item_name}</td>
                <td>${item.location}</td>
                <td>${item.quantity}</td>
                <td>${item.timestamp ? new Date(item.timestamp).toLocaleString() : "N/A"}</td>
                <td><button class="delete-btn" onclick="deleteItem('${item._id}')">🗑️</button></td>
            `;
            tableBody.appendChild(row);
        });
    })
    .catch(error => console.error("Errore nel caricamento della lista:", error));
}

// Funzione per filtrare gli elementi in base al range di date
function loadItemsByTimestamp() {
    const startTimestamp = document.getElementById("start_timestamp").value;
    const endTimestamp = document.getElementById("end_timestamp").value;

    // Controllo se le date sono valide
    if (!startTimestamp || !endTimestamp) {
        alert("Inserisci entrambe le date per il filtro.");
        return;
    }

    fetch(`/todolist/update/${startTimestamp}/${endTimestamp}`)
    .then(response => response.json())
    .then(data => {
        const tableBody = document.getElementById("filtered_items_body");
        tableBody.innerHTML = data.length === 0 ? "<tr><td colspan='5'>Nessun elemento trovato.</td></tr>" : "";

        data.forEach(item => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${item.item_name}</td>
                <td>${item.location}</td>
                <td>${item.quantity}</td>
                <td>${new Date(item.timestamp).toLocaleString()}</td>
                <td><button class="delete-btn" onclick="deleteItem('${item._id}')">🗑️</button></td>
            `;
            tableBody.appendChild(row);
        });
    })
    .catch(error => console.error("Errore:", error));
}
