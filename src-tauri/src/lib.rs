use rusqlite::{Connection, Result};
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub db: Mutex<Connection>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct Item {
    pub id: String,
    pub category: String,
    pub is_rented: bool,
    pub current_user: Option<String>,
    pub user_class: Option<String>,
    pub due_date: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct Loan {
    pub id: i32,
    pub item_id: String,
    pub user_id: String,
    pub user_class: Option<String>,
    pub loan_date: String,
    pub due_date: Option<String>,
}

pub fn init_db() -> Result<Connection> {
    let conn = Connection::open("../utstyr.db")?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            is_rented BOOLEAN NOT NULL,
            current_user TEXT,
            user_class TEXT,
            due_date TEXT
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS loans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            user_class TEXT,
            loan_date TEXT NOT NULL,
            due_date TEXT,
            FOREIGN KEY(item_id) REFERENCES items(id)
        )",
        [],
    )?;

    Ok(conn)
}

#[tauri::command]
fn add_item(state: State<AppState>, id: String, category: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO items (id, category, is_rented, current_user, user_class, due_date) VALUES (?1, ?2, 0, NULL, NULL, NULL)",
        rusqlite::params![id, category],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_item(state: State<AppState>, item_id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM items WHERE id = ?1", [&item_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_items(state: State<AppState>) -> Result<Vec<Item>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, category, is_rented, current_user, user_class, due_date FROM items")
        .map_err(|e| e.to_string())?;

    let item_iter = stmt
        .query_map([], |row| {
            Ok(Item {
                id: row.get(0)?,
                category: row.get(1)?,
                is_rented: row.get(2)?,
                current_user: row.get(3)?,
                user_class: row.get(4)?,
                due_date: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for item in item_iter {
        items.push(item.map_err(|e| e.to_string())?);
    }
    Ok(items)
}

#[tauri::command]
fn get_loans(state: State<AppState>) -> Result<Vec<Loan>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, item_id, user_id, user_class, loan_date, due_date FROM loans")
        .map_err(|e| e.to_string())?;

    let loan_iter = stmt
        .query_map([], |row| {
            Ok(Loan {
                id: row.get(0)?,
                item_id: row.get(1)?,
                user_id: row.get(2)?,
                user_class: row.get(3)?,
                loan_date: row.get(4)?,
                due_date: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut loans = Vec::new();
    for loan in loan_iter {
        loans.push(loan.map_err(|e| e.to_string())?);
    }
    Ok(loans)
}

#[tauri::command]
fn checkout_item(
    state: State<AppState>,
    item_id: String,
    user_id: String,
    user_class: String,
    due_date: Option<String>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let is_rented: bool = conn
        .query_row(
            "SELECT is_rented FROM items WHERE id = ?1",
            [&item_id],
            |row| row.get(0),
        )
        .map_err(|_| "Utstyret finnes ikke i systemet.")?;

    if is_rented {
        return Err("Utstyret er allerede utlånt!".to_string());
    }

    let class_val = if user_class.is_empty() {
        None
    } else {
        Some(user_class)
    };

    conn.execute(
        "UPDATE items SET is_rented = 1, current_user = ?2, user_class = ?3, due_date = ?4 WHERE id = ?1",
        rusqlite::params![item_id, user_id, class_val, due_date],
    )
    .map_err(|e| e.to_string())?;

    let now = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
    conn.execute(
        "INSERT INTO loans (item_id, user_id, user_class, loan_date, due_date) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![item_id, user_id, class_val, now, due_date],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn return_item(state: State<AppState>, item_id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE items SET is_rented = 0, current_user = NULL, user_class = NULL, due_date = NULL WHERE id = ?1",
        [&item_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db = init_db().expect("Feil ved opprettelse av SQLite-database");

    tauri::Builder::default()
        .manage(AppState { db: Mutex::new(db) })
        .invoke_handler(tauri::generate_handler![
            add_item,
            delete_item,
            get_items,
            get_loans,
            checkout_item,
            return_item
        ])
        .run(tauri::generate_context!())
        .expect("Feil under kjøring av Tauri-applikasjonen");
}
