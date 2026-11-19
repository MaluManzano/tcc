
document.addEventListener("DOMContentLoaded", () => {
    const lista = document.querySelector("#listaCarrinho");
    const totalElemento = document.querySelector("#totalCarrinho");
    const botaoComprar = document.querySelector("#finalizarCompra");
    const mensagem = document.querySelector("#mensagemCarrinho");

    if (!lista) return;

    const CHAVE_CARRINHO = "biostore_carrinho";
    const CHAVE_USUARIO = "biostore_user";

    function lerCarrinho() {
        try {
            const dados = JSON.parse(
                localStorage.getItem(CHAVE_CARRINHO) || "[]"
            );

            return Array.isArray(dados) ? dados : [];
        } catch {
            return [];
        }
    }

    function salvarCarrinho(carrinho) {
        localStorage.setItem(
            CHAVE_CARRINHO,
            JSON.stringify(carrinho)
        );
    }

    function lerUsuario() {
        try {
            return JSON.parse(
                localStorage.getItem(CHAVE_USUARIO) || "null"
            );
        } catch {
            return null;
        }
    }

    function mostrarMensagem(texto, erro = false) {
        if (!mensagem) return;

        mensagem.textContent = texto;
        mensagem.className = erro ? "mensagem erro" : "mensagem";
    }

    function removerItem(id) {
        const atualizados = lerCarrinho().filter(
            p => String(p.id) !== String(id)
        );

        salvarCarrinho(atualizados);
        renderizarCarrinho();
    }

    function alterarQuantidade(id, variacao) {
        const carrinho = lerCarrinho();

        const item = carrinho.find(
            p => String(p.id) === String(id)
        );

        if (!item) return;

        item.quantidade =
            (Number(item.quantidade) || 1) + variacao;

        if (item.quantidade <= 0) {
            removerItem(id);
            return;
        }

        salvarCarrinho(carrinho);
        renderizarCarrinho();
    }

    function renderizarCarrinho() {
        const carrinho = lerCarrinho();

        lista.replaceChildren();

        if (carrinho.length === 0) {
            lista.innerHTML =
                '<p class="vazio">Seu carrinho está vazio.</p>';

            totalElemento.textContent = formatarPreco(0);
            botaoComprar.disabled = true;
            return;
        }

        botaoComprar.disabled = false;

        let total = 0;

        carrinho.forEach((item) => {
            const qtd = Math.max(
                1,
                Number(item.quantidade) || 1
            );

            const preco = Number(item.preco) || 0;

            total += preco * qtd;

            const linha = document.createElement("article");

            linha.className = "carrinho-item";

            linha.innerHTML = `
                <div>
                    <h3></h3>
                    <p>${formatarPreco(preco)} por unidade</p>
                </div>

                <div class="quantidade">
                    <button type="button"
                        aria-label="Diminuir quantidade">−</button>

                    <span>${qtd}</span>

                    <button type="button"
                        aria-label="Aumentar quantidade">+</button>
                </div>

                <strong>${formatarPreco(preco * qtd)}</strong>

                <button type="button" class="botao-remover">
                    Remover
                </button>
            `;

            linha.querySelector("h3").textContent = item.nome;

            const [btnMenos, btnMais] =
                linha.querySelectorAll(".quantidade button");

            btnMenos.addEventListener("click", () => {
                alterarQuantidade(item.id, -1);
            });

            btnMais.addEventListener("click", () => {
                alterarQuantidade(item.id, 1);
            });

            linha.querySelector(".botao-remover")
                .addEventListener("click", () => {
                    removerItem(item.id);
                });

            lista.appendChild(linha);
        });

        totalElemento.textContent = formatarPreco(total);
    }

    // FINALIZAR COMPRA
    botaoComprar.addEventListener("click", async () => {
        const carrinho = lerCarrinho();
        const usuarioLogado = lerUsuario();

        if (carrinho.length === 0) {
            mostrarMensagem(
                "Adicione produtos antes de comprar.",
                true
            );
            return;
        }

        if (!usuarioLogado || !usuarioLogado.id) {
            mostrarMensagem(
                "Faça login antes de finalizar a compra.",
                true
            );

            setTimeout(() => {
                window.location.href = "login.html";
            }, 1200);

            return;
        }

        botaoComprar.disabled = true;

        try {
            requisicaoAPI("/pedidos", {
                method: "POST",

                body: JSON.stringify({
                    usuario_id: usuarioLogado.id,

                    itens: carrinho.map(item => ({
                        produto_id: item.id,
                        quantidade: Number(item.quantidade)
                    }))
                })
            });

            localStorage.removeItem(CHAVE_CARRINHO);

            renderizarCarrinho();

            mostrarMensagem(
                `Compra realizada com sucesso! Pedido nº ${pedido.id}.`
            );

        } catch (erro) {
            mostrarMensagem(
                "Não foi possível finalizar a compra: " +
                erro.message,
                true
            );

        } finally {
            botaoComprar.disabled = false;
        }
    });

    renderizarCarrinho();
});
