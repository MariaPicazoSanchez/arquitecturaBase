const { MongoClient } = require("mongodb");
const uri = "mongodb+srv://mps:Prueba123-FuLL@cluster0.owy5cl8.mongodb.net/?appName=Cluster0";

async function main() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log("¡Conexión exitosa!");
  } catch (error) {
    console.error("Error de conexión:", error);
  } finally {
    await client.close();
  }
}

main();
