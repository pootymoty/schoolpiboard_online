using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations;

/// <summary>Содержимое доски — этап 11c.</summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260826200000_BoardItems")]
public partial class BoardItems : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "board_items",
            columns: table => new
            {
                id = table.Column<long>(type: "bigint", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                board_id = table.Column<long>(type: "bigint", nullable: false),
                type = table.Column<string>(type: "text", nullable: false),
                z = table.Column<int>(type: "integer", nullable: false),
                data = table.Column<string>(type: "jsonb", nullable: false),
                image_ref = table.Column<string>(type: "text", nullable: true),
                created_by = table.Column<long>(type: "bigint", nullable: true),
                created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                locked_by = table.Column<string>(type: "text", nullable: true),
                locked_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_board_items", x => x.id);
                table.ForeignKey(
                    name: "FK_board_items_boards_board_id",
                    column: x => x.board_id,
                    principalTable: "boards",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        // Доска читается целиком и в порядке отрисовки.
        migrationBuilder.CreateIndex(
            name: "IX_board_items_board_id_z",
            table: "board_items",
            columns: new[] { "board_id", "z" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "board_items");
    }
}
