namespace SchoolPiBoard.Web.Data.Entities;

/// <summary>
/// Тариф: пределы и цены.
///
/// Цены лежат в базе, а не в коде: их меняют чаще, чем выкладывают
/// службу, и правка цены не должна требовать сборки.
///
/// Тариф отвечает за пределы, период — за срок. Складывать их в одно
/// перечисление нельзя: с появлением второго уровня два значения
/// превратились бы в шесть.
/// </summary>
public class Plan
{
    /// <summary>Бесплатный уровень. Он всегда есть и никогда не кончается.</summary>
    public const string CodeFree = "free";

    /// <summary>С него начинается пробный период — на нём же он и заканчивается.</summary>
    public const string CodeStandard = "standard";

    public int Id { get; set; }

    public string Code { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    /// <summary>Показывать ли его на странице тарифов. Снятый тариф остаётся у тех, кто на нём.</summary>
    public bool Active { get; set; } = true;

    /// <summary>Порядок в таблице тарифов: от простого к дорогому.</summary>
    public int Sort { get; set; }

    /// <summary>Цены в рублях за период. У бесплатного — нули.</summary>
    public int Price30 { get; set; }

    public int Price90 { get; set; }

    public int Price180 { get; set; }

    public int Price365 { get; set; }

    public int MaxBoards { get; set; }

    /// <summary>Сколько места под файлы даётся на всю учётную запись.</summary>
    public long MaxStorageBytes { get; set; }

    /// <summary>Сколько человек может быть на доске одновременно, считая владельца.</summary>
    public int MaxParticipants { get; set; }

    /// <summary>Библиотека документов: загрузка PDF и вставка страниц.</summary>
    public bool HasLibrary { get; set; }

    /// <summary>Цена за выбранный период. Незнакомый период — отказ, а не догадка.</summary>
    public int? PriceFor(int days) => days switch
    {
        30 => Price30,
        90 => Price90,
        180 => Price180,
        365 => Price365,
        _ => null
    };
}
