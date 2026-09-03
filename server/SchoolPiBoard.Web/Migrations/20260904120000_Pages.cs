using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations;

/// <summary>
/// Страницы доски.
///
/// У каждой существующей доски заводится одна страница, и всё уже
/// нарисованное переезжает на неё: доски без страниц не бывает, и
/// колонка страницы у объекта обязательна. Порядок шагов важен —
/// сначала страницы, потом колонка, потом её заполнение, и только затем
/// запрет пустого значения.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260904120000_Pages")]
public partial class Pages : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "board_pages",
            columns: table => new
            {
                id = table.Column<long>(type: "bigint", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                board_id = table.Column<long>(type: "bigint", nullable: false),
                title = table.Column<string>(type: "text", nullable: false),
                sort = table.Column<int>(type: "integer", nullable: false),
                visibility = table.Column<string>(type: "text", nullable: false),
                created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_board_pages", x => x.id);
                table.ForeignKey(
                    name: "FK_board_pages_boards_board_id",
                    column: x => x.board_id,
                    principalTable: "boards",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "board_page_viewers",
            columns: table => new
            {
                id = table.Column<long>(type: "bigint", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                page_id = table.Column<long>(type: "bigint", nullable: false),
                participant_key = table.Column<string>(type: "text", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_board_page_viewers", x => x.id);
                table.ForeignKey(
                    name: "FK_board_page_viewers_board_pages_page_id",
                    column: x => x.page_id,
                    principalTable: "board_pages",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_board_pages_board_id_sort",
            table: "board_pages",
            columns: new[] { "board_id", "sort" });

        migrationBuilder.CreateIndex(
            name: "IX_board_page_viewers_page_id_participant_key",
            table: "board_page_viewers",
            columns: new[] { "page_id", "participant_key" },
            unique: true);

        // Первая страница каждой доски. Нарисованное до сегодняшнего дня
        // принадлежит ей: другой страницы у этих досок не было.
        migrationBuilder.Sql(@"
            INSERT INTO board_pages (board_id, title, sort, visibility, created_at)
            SELECT id, 'Страница 1', 1, 'all', now() FROM boards;
        ");

        migrationBuilder.AddColumn<long>(
            name: "page_id",
            table: "board_items",
            type: "bigint",
            nullable: false,
            defaultValue: 0L);

        migrationBuilder.Sql(@"
            UPDATE board_items i
            SET page_id = p.id
            FROM board_pages p
            WHERE p.board_id = i.board_id AND p.sort = 1;
        ");

        // Объект без страницы — объект ниоткуда: показать его негде.
        // Такие могли остаться только от доски, удалённой между двумя
        // шагами выше, поэтому их и убираем.
        migrationBuilder.Sql("DELETE FROM board_items WHERE page_id = 0;");

        migrationBuilder.CreateIndex(
            name: "IX_board_items_page_id_z",
            table: "board_items",
            columns: new[] { "page_id", "z" });

        migrationBuilder.AddForeignKey(
            name: "FK_board_items_board_pages_page_id",
            table: "board_items",
            column: "page_id",
            principalTable: "board_pages",
            principalColumn: "id",
            onDelete: ReferentialAction.Cascade);

        // Прежний составной индекс по доске и порядку больше не нужен:
        // читают всегда страницу. Но внешний ключ доски без индекса
        // оставлять нельзя — по доске считают предел объектов.
        migrationBuilder.DropIndex(name: "IX_board_items_board_id_z", table: "board_items");

        migrationBuilder.CreateIndex(
            name: "IX_board_items_board_id", table: "board_items", column: "board_id");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey(name: "FK_board_items_board_pages_page_id", table: "board_items");
        migrationBuilder.DropIndex(name: "IX_board_items_page_id_z", table: "board_items");
        migrationBuilder.DropColumn(name: "page_id", table: "board_items");
        migrationBuilder.DropIndex(name: "IX_board_items_board_id", table: "board_items");

        migrationBuilder.CreateIndex(
            name: "IX_board_items_board_id_z",
            table: "board_items",
            columns: new[] { "board_id", "z" });

        migrationBuilder.DropTable(name: "board_page_viewers");
        migrationBuilder.DropTable(name: "board_pages");
    }
}
