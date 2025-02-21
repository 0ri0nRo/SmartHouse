document.addEventListener("DOMContentLoaded", function () {
    loadShoppingList(); // Load the list on startup
});

// Function to add a new item to the list
function addItem() {
    const itemName = document.getElementById("item_name").value;
    const store = document.getElementById("store").value;
    const quantity = document.getElementById("quantity").value;
    const neededBy = document.getElementById("needed_by").value;

    if (!itemName || !store || !quantity || quantity <= 0) {
        alert("Please fill in all required fields with valid values.");
        return;
    }

    fetch("/todolist/insert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            item_name: itemName,
            store: store,
            quantity: parseInt(quantity),
            timestamp: neededBy || null
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.message === "Documents inserted successfully") {
            document.getElementById("item_name").value = "";
            document.getElementById("store").value = "";
            document.getElementById("quantity").value = "";
            document.getElementById("needed_by").value = "";
            loadShoppingList(); // Reload the list after adding the item
        }
    })
    .catch(error => console.error("Error adding the item:", error));
}

// Function to delete an item from the list
function deleteItem(id) {
    fetch(`/todolist/delete/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" }
    })
    .then(response => {
        if (!response.ok) {  // If the response is not OK
            throw new Error('Error deleting the item');
        }
        return response.json();
    })
    .then(data => {
        if (data.message.includes("successfully")) {
            loadShoppingList(); // Reload the list after deletion
        }
    })
    .catch(error => {
        console.error("Error deleting the item:", error);
    });
}

// Function to load the shopping list
function loadShoppingList() {
    fetch("/todolist/today")
    .then(response => response.json())
    .then(data => {
        const tableBody = document.getElementById("shopping_list_body");
        tableBody.innerHTML = ""; // Clear the table before filling it

        if (data.length === 0) {
            tableBody.innerHTML = "<tr><td colspan='5'>No items in the list.</td></tr>";
            return;
        }

        // Populate the table with the items
        data.forEach(item => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${item.item_name}</td>
                <td>${item.store}</td>
                <td>${item.quantity}</td>
                <td>${item.timestamp ? formatTimestamp(item.timestamp) : "N/A"}</td>
                <td><button class="delete-btn" onclick="deleteItem('${item._id}')">🗑️</button></td>
            `;
            tableBody.appendChild(row);
        });
    })
    .catch(error => console.error("Error loading the shopping list:", error));
}

// Function to filter items based on the date range
function loadItemsByTimestamp() {
    const startTimestamp = document.getElementById("start_timestamp").value;
    const endTimestamp = document.getElementById("end_timestamp").value;

    // Check if the dates are valid
    if (!startTimestamp || !endTimestamp) {
        alert("Please enter both start and end dates for the filter.");
        return;
    }

    fetch(`/todolist/update/${startTimestamp}/${endTimestamp}`)
    .then(response => response.json())
    .then(data => {
        const tableBody = document.getElementById("filtered_items_body");
        tableBody.innerHTML = data.length === 0 ? "<tr><td colspan='5'>No items found.</td></tr>" : "";

        data.forEach(item => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${item.item_name}</td>
                <td>${item.store}</td>
                <td>${item.quantity}</td>
                <td>${formatTimestamp(item.timestamp)}</td>
                <td><button class="delete-btn" onclick="deleteItem('${item._id}')">🗑️</button></td>
            `;
            tableBody.appendChild(row);
        });
    })
    .catch(error => console.error("Error:", error));
}

// Function to format timestamp into a readable format
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}
