
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();

app.use(cors());
app.use(express.json());

// 1. Conexão com o banco de dados
const conexao = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'projeto_integrador',
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10
});

// 2. BUSCAR PRODUTOS
app.get('/api/produtos', async function (req, res) {
    try {
        const sql = `
            SELECT
                p.id_produto AS id,
                p.nome,
                c.nome AS categoria,
                p.preco,
                p.estoque,
                p.descricao
            FROM produtos p
            LEFT JOIN categorias c
                ON p.id_categoria = c.id_categoria
        `;

        const [resultados] = await conexao.query(sql);

        res.json(resultados);

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: 'Erro ao buscar produtos.'
        });
    }
});

// 3. CADASTRO DE USUÁRIOS
app.post('/api/auth/cadastro', async function (req, res) {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {
        return res.status(400).json({
            mensagem: 'Preencha todos os campos.'
        });
    }

    if (senha.length < 6) {
        return res.status(400).json({
            mensagem: 'A senha deve ter pelo menos 6 caracteres.'
        });
    }

    try {
        const senha_hash = await bcrypt.hash(senha, 10);

        const sql = `
            INSERT INTO usuarios (nome, email, senha_hash)
            VALUES (?, ?, ?)
        `;

        await conexao.execute(sql, [nome, email, senha_hash]);

        res.status(201).json({
            mensagem: 'Cadastro realizado com sucesso!'
        });

    } catch (erro) {
        console.log(erro);

        if (erro.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                mensagem: 'Este e-mail já está cadastrado.'
            });
        }

        res.status(500).json({
            mensagem: 'Erro ao cadastrar usuário.'
        });
    }
});

// 4. LOGIN DE USUÁRIOS
app.post('/api/auth/login', async function (req, res) {
    const { email, senha } = req.body;

    if (!email || !senha) {
        return res.status(400).json({
            mensagem: 'Preencha o e-mail e a senha.'
        });
    }

    try {
        const sql = `
            SELECT id_usuario, nome, email, senha_hash
            FROM usuarios
            WHERE email = ?
        `;

        const [resultados] = await conexao.execute(sql, [email]);

        if (resultados.length === 0) {
            return res.status(401).json({
                mensagem: 'E-mail ou senha incorretos.'
            });
        }

        const usuario = resultados[0];

        const senhaCorreta = await bcrypt.compare(
            senha,
            usuario.senha_hash
        );

        if (!senhaCorreta) {
            return res.status(401).json({
                mensagem: 'E-mail ou senha incorretos.'
            });
        }

        res.json({
            mensagem: 'Login realizado com sucesso!',
            usuario: {
                id: usuario.id_usuario,
                nome: usuario.nome,
                email: usuario.email
            }
        });

    } catch (erro) {
        console.log(erro);

        res.status(500).json({
            mensagem: 'Erro ao realizar login.'
        });
    }
});

// 5. FINALIZAR COMPRA
app.post('/api/pedidos', async function (req, res) {

    console.log("ROTA DE PEDIDOS FOI CHAMADA!", req.body);
    
    const { usuario_id, itens } = req.body;

    if (!Number.isInteger(Number(usuario_id)) || Number(usuario_id) <= 0) {
        return res.status(400).json({
            mensagem: 'Usuário inválido.'
        });
    }

    if (!Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({
            mensagem: 'O carrinho está vazio.'
        });
    }

    const conexaoPedido = await conexao.getConnection();

    try {
        await conexaoPedido.beginTransaction();

        // Agrupa produtos repetidos no carrinho
        const quantidades = new Map();

        for (const item of itens) {
            const produtoId = Number(item.produto_id);
            const quantidade = Number(item.quantidade);

            if (
                !Number.isInteger(produtoId) ||
                produtoId <= 0 ||
                !Number.isInteger(quantidade) ||
                quantidade <= 0
            ) {
                throw new Error('Produto ou quantidade inválida.');
            }

            quantidades.set(
                produtoId,
                (quantidades.get(produtoId) || 0) + quantidade
            );
        }

        let valorTotal = 0;
        const produtosCompra = [];

        // Confere produtos, preços e estoque
        for (const [produtoId, quantidade] of quantidades) {
            const sqlProduto = `
                SELECT id_produto, nome, preco, estoque
                FROM produtos
                WHERE id_produto = ?
                FOR UPDATE
            `;

            const [produtos] = await conexaoPedido.execute(
                sqlProduto,
                [produtoId]
            );

            if (produtos.length === 0) {
                throw new Error('Um dos produtos não foi encontrado.');
            }

            const produto = produtos[0];

            if (Number(produto.estoque) < quantidade) {
                throw new Error(
                    `Estoque insuficiente para ${produto.nome}.`
                );
            }

            const preco = Number(produto.preco);

            valorTotal += preco * quantidade;

            produtosCompra.push({
                id: produtoId,
                quantidade: quantidade,
                preco: preco
            });
        }

        // Registra a compra
        const sqlCompra = `
            INSERT INTO compras
                (id_usuario, valor_total, status)
            VALUES (?, ?, ?)
        `;

        const [resultadoCompra] = await conexaoPedido.execute(
            sqlCompra,
            [Number(usuario_id), valorTotal, 'Pendente']
        );

        const idCompra = resultadoCompra.insertId;

        // Registra os produtos da compra e atualiza o estoque
        for (const item of produtosCompra) {
            const sqlItem = `
                INSERT INTO itens_compra
                    (id_compra, id_produto, quantidade, preco_unitario)
                VALUES (?, ?, ?, ?)
            `;

            await conexaoPedido.execute(sqlItem, [
                idCompra,
                item.id,
                item.quantidade,
                item.preco
            ]);

            const sqlEstoque = `
                UPDATE produtos
                SET estoque = estoque - ?
                WHERE id_produto = ?
            `;

            await conexaoPedido.execute(sqlEstoque, [
                item.quantidade,
                item.id
            ]);
        }

        // Confirma todas as operações
        await conexaoPedido.commit();

        res.status(201).json({
            mensagem: 'Compra realizada com sucesso!',
            id: idCompra,
            valor_total: valorTotal
        });

    } catch (erro) {
        await conexaoPedido.rollback();

        console.log(erro);

        res.status(400).json({
            mensagem: erro.message || 'Não foi possível finalizar a compra.'
        });

    } finally {
        conexaoPedido.release();
    }
});

// 6. INICIAR SERVIDOR
async function iniciarServidor() {
    try {
        await conexao.query('SELECT 1');

        console.log('Conectado ao banco BioStore com sucesso!');

        app.listen(3000, function () {
            console.log('Servidor rodando em http://localhost:3000');
        });

    } catch (erro) {
        console.log('Erro ao conectar no banco:', erro);
    }
}

iniciarServidor();
