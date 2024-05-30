const path = require("path");
const express = require("express");
const app = express();
const oracledb = require("oracledb");

// Set EJS as the view engine
app.set("view engine", "ejs");

// Define the directory where your HTML files (views) are located
app.set("views", path.join(__dirname, "views"));

// Optionally, you can define a static files directory (CSS, JS, images, etc.)
app.use(express.static(path.join(__dirname, "public")));

app.use(express.json());

// index.js
// ... imports and express configuration's here.

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

let connection;

async function connectToDatabase() {
  try {
    connection = await oracledb.getConnection({
      user: "admin",
      password: "password",
      connectionString: "0.0.0.0:1521/XEPDB1",
    });
  } catch (err) {
    console.error(err);
  }
}

async function setupDatabase() {
  // Remove old tables, dev only.
  await connection.execute(
    `BEGIN
    execute immediate 'drop table users CASCADE CONSTRAINTS';
    execute immediate 'drop table accounts CASCADE CONSTRAINTS';
    exception when others then if sqlcode <> -942 then raise; end if;
    END;`
  );

  // Create new tables, dev only.
  await connection.execute(
    `create table users (
      id number generated always as identity,
      name varchar2(256),
      email varchar2(512),
      creation_ts timestamp with time zone default current_timestamp,
      accounts number,
      primary key (id)
    )`
  );
  await connection.execute(
    `create table accounts (
      id number generated always as identity,
      name varchar2(256),
      amount number,
      user_id number,
      CONSTRAINT fk_user
      FOREIGN KEY (user_id)
      REFERENCES users (id),
      creation_ts timestamp with time zone default current_timestamp,
      primary key (id)
  )`
  );

  await connection.execute(
    `CREATE OR REPLACE PROCEDURE insert_user (
      p_user_name IN users.name%TYPE,
      p_user_email IN users.email%TYPE,
      p_user_id OUT users.id%TYPE
  ) AS
  BEGIN
      INSERT INTO users (name, email)
      VALUES (p_user_name, p_user_email)
      RETURNING id INTO p_user_id;
  END;`
  );

    // Insert some data
    const usersSql = `insert into users (name, email, accounts) values(:1, :2, :3)`;
    const usersRows = [
      ["Valentin Montagne", "contact@vm-it-consulting.com", 0],
      ["Amélie Dal", "amelie.dal@gmail.com", 0],
    ];
    let usersResult = await connection.executeMany(usersSql, usersRows);
    console.log(usersResult.rowsAffected, "Users rows inserted");
    const accountsSql = `insert into accounts (name, amount, user_id) values(:1, :2, :3)`;
    const accountsRows = [["Compte courant", 2000, 1]];
    let accountsResult = await connection.executeMany(accountsSql, accountsRows);
    console.log(accountsResult.rowsAffected, "Accounts rows inserted");
    connection.commit(); // Now query the rows back
  }

app.get("/", async (req, res) => {
  res.render("index"); // Assuming you have an "index.ejs" file in the "views" directory
});

app.get("/users", async (req, res) => {
  const getUsersSQL = `select * from users`;
  const result = await connection.execute(getUsersSQL);

  res.json(result.rows);
});

app.post("/users", async (req, res) => {
  const createUserSQL = `BEGIN
    insert_user(:name, :email, :user_id);
  END;`;
  const result = await connection.execute(createUserSQL, {
    name: req.body.name,
    email: req.body.email,
    user_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
  });

  app.get("/accounts", async (req, res) => {
    const getAccountsSQL = `select * from accounts`;
    const result = await connection.execute(getAccountsSQL);
  
    res.json(result.rows);
  });
  

  app.get("/views/:userId", async (req, res) => {
    const getCurrentUserSQL = `select * from users where id = :1`;
    const getAccountsSQL = `select * from accounts where user_id = :1`;
    const [currentUser, accounts] = await Promise.all([
      connection.execute(getCurrentUserSQL, [req.params.userId]),
      connection.execute(getAccountsSQL, [req.params.userId]),
    ]);
  
    console.log(currentUser, accounts);
    res.render("user-view", {
      currentUser: currentUser.rows[0],
      accounts: accounts.rows,
    });
  });

  console.log(result);
  if (result.outBinds && result.outBinds.user_id) {
    res.redirect(`/views/${result.outBinds.user_id}`);
  } else {
    res.sendStatus(500);
  }
});

	
connectToDatabase().then(async () => {
  await setupDatabase();
  // Start the server
  app.listen(3001, () => {
    console.log("Server started on http://localhost:3001");
  });
});