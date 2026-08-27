using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations;

/// <summary>
/// Оформление холста: цвет фона и разлиновка.
///
/// Значения по умолчанию заданы на уровне базы, чтобы уже созданные
/// доски получили их сами: иначе колонка потребовала бы либо nullable,
/// либо отдельного прохода по всем строкам.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260826220000_BoardBackground")]
public partial class BoardBackground : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "background", table: "boards", type: "text", nullable: false, defaultValue: "#FFFDF8");

        migrationBuilder.AddColumn<string>(
            name: "grid_style", table: "boards", type: "text", nullable: false, defaultValue: "none");

        migrationBuilder.AddColumn<string>(
            name: "grid_color", table: "boards", type: "text", nullable: false, defaultValue: "#D9CFC0");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "background", table: "boards");
        migrationBuilder.DropColumn(name: "grid_style", table: "boards");
        migrationBuilder.DropColumn(name: "grid_color", table: "boards");
    }
}
